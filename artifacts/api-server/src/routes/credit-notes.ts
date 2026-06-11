import { Router } from "express";
import {
  db, creditNotes, creditNoteLineItems, creditNoteApplications,
  customers, invoices, journalEntries, journalLines,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { findSystemAccount, postEntry } from "../lib/ledger";
import { getTaxMap, computeLines, sumTotals } from "../lib/documents";

const router = Router();
router.use(requireAuth);

function serialize(c: typeof creditNotes.$inferSelect, customerName?: string | null) {
  return { ...c, customerName: customerName ?? null, date: c.date.toISOString(), createdAt: c.createdAt.toISOString() };
}

router.get("/credit-notes", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db.select({ c: creditNotes, customerName: customers.name })
    .from(creditNotes).leftJoin(customers, eq(creditNotes.customerId, customers.id))
    .where(eq(creditNotes.organizationId, orgId)).orderBy(desc(creditNotes.date));
  res.json(rows.map(r => serialize(r.c, r.customerName)));
});

router.get("/credit-notes/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [row] = await db.select({ c: creditNotes, customerName: customers.name })
    .from(creditNotes).leftJoin(customers, eq(creditNotes.customerId, customers.id))
    .where(and(eq(creditNotes.id, req.params.id), eq(creditNotes.organizationId, orgId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const lines = await db.select().from(creditNoteLineItems)
    .where(eq(creditNoteLineItems.creditNoteId, req.params.id)).orderBy(creditNoteLineItems.sortOrder);
  const apps = await db.select({ a: creditNoteApplications, number: invoices.number })
    .from(creditNoteApplications).leftJoin(invoices, eq(creditNoteApplications.invoiceId, invoices.id))
    .where(eq(creditNoteApplications.creditNoteId, req.params.id));
  res.json({ ...serialize(row.c, row.customerName), lineItems: lines, applications: apps.map(x => ({ ...x.a, invoiceNumber: x.number })) });
});

router.post("/credit-notes", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { customerId, number, date, memo, lines } = req.body;
  if (!customerId || !number || !date || !lines?.length) { res.status(400).json({ error: "Missing required fields" }); return; }

  const computed = computeLines(lines, await getTaxMap(orgId));
  const { subtotalCents, taxCents, totalCents } = sumTotals(computed);
  if (totalCents <= 0) { res.status(400).json({ error: "Total must be greater than zero" }); return; }

  // Post: debit income lines (+ sales tax), credit A/R.
  const ar = await findSystemAccount(orgId, "AR");
  const entryLines: Array<{ accountId: string; debitCents: number; creditCents: number }> =
    computed.map(l => ({ accountId: l.accountId, debitCents: l.amountCents, creditCents: 0 }));
  if (taxCents > 0) {
    try { const tax = await findSystemAccount(orgId, "SALES_TAX_PAYABLE"); entryLines.push({ accountId: tax.id, debitCents: taxCents, creditCents: 0 }); }
    catch { entryLines[0].debitCents += taxCents; }
  }
  entryLines.push({ accountId: ar.id, debitCents: 0, creditCents: totalCents });

  const cn = await db.transaction(async (tx) => {
    const [row] = await tx.insert(creditNotes).values({
      organizationId: orgId, customerId, number, date: new Date(date), memo: memo || null,
      subtotalCents, taxCents, totalCents, balanceCents: totalCents,
    }).returning();

    await tx.insert(creditNoteLineItems).values(computed.map((l, i) => ({
      creditNoteId: row.id, description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents,
      taxRateId: l.taxRateId || null, accountId: l.accountId, amountCents: l.amountCents, sortOrder: i,
    })));

    const entry = await postEntry({ organizationId: orgId, date: new Date(date), memo: memo || `Credit note ${number}`, sourceType: "CREDIT_NOTE", sourceId: row.id, lines: entryLines }, tx);
    await tx.update(creditNotes).set({ journalEntryId: entry.id }).where(eq(creditNotes.id, row.id));
    return { ...row, journalEntryId: entry.id };
  });
  res.status(201).json(serialize(cn));
});

// Apply available credit to one or more of the customer's open invoices.
router.post("/credit-notes/:id/apply", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { applications } = req.body as { applications?: Array<{ invoiceId: string; amountCents: number }> };
  const [cn] = await db.select().from(creditNotes).where(and(eq(creditNotes.id, req.params.id), eq(creditNotes.organizationId, orgId)));
  if (!cn) { res.status(404).json({ error: "Not found" }); return; }

  const apps = (applications ?? []).map(a => ({ invoiceId: a.invoiceId, amountCents: Math.round(Number(a.amountCents) || 0) })).filter(a => a.invoiceId && a.amountCents > 0);
  const total = apps.reduce((s, a) => s + a.amountCents, 0);
  if (total <= 0) { res.status(400).json({ error: "Enter an amount to apply." }); return; }
  if (total > cn.balanceCents) { res.status(400).json({ error: "Applied amount exceeds the available credit." }); return; }

  const invIds = apps.map(a => a.invoiceId);
  const invs = await db.select().from(invoices).where(and(eq(invoices.organizationId, orgId), inArray(invoices.id, invIds)));
  const invMap = new Map(invs.map(i => [i.id, i]));
  for (const a of apps) {
    const inv = invMap.get(a.invoiceId);
    if (!inv || inv.customerId !== cn.customerId) { res.status(400).json({ error: "Invoice not found for this customer." }); return; }
    if (a.amountCents > inv.balanceCents) { res.status(400).json({ error: `Amount exceeds balance on ${inv.number}.` }); return; }
  }

  await db.transaction(async (tx) => {
    for (const a of apps) {
      const inv = invMap.get(a.invoiceId)!;
      const newBal = inv.balanceCents - a.amountCents;
      await tx.update(invoices).set({ balanceCents: newBal, status: newBal <= 0 ? "PAID" : "PARTIAL" }).where(eq(invoices.id, a.invoiceId));
      await tx.insert(creditNoteApplications).values({ creditNoteId: cn.id, invoiceId: a.invoiceId, amountCents: a.amountCents });
    }
    await tx.update(creditNotes).set({ balanceCents: cn.balanceCents - total }).where(eq(creditNotes.id, cn.id));
  });
  res.json({ ok: true, appliedCents: total, remainingCents: cn.balanceCents - total });
});

router.post("/credit-notes/:id/void", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [cn] = await db.select().from(creditNotes).where(and(eq(creditNotes.id, req.params.id), eq(creditNotes.organizationId, orgId)));
  if (!cn) { res.status(404).json({ error: "Not found" }); return; }
  if (cn.balanceCents !== cn.totalCents) { res.status(400).json({ error: "Cannot void a credit note that has been applied. Remove applications first." }); return; }

  await db.transaction(async (tx) => {
    const [je] = await tx.select().from(journalEntries).where(and(eq(journalEntries.organizationId, orgId), eq(journalEntries.sourceId, cn.id))).limit(1);
    if (je) {
      const lines = await tx.select().from(journalLines).where(eq(journalLines.journalEntryId, je.id));
      await postEntry({ organizationId: orgId, date: new Date(), memo: `Void credit note ${cn.number}`, sourceType: "ADJUSTMENT", isReversal: true, reversedEntryId: je.id, lines: lines.map(l => ({ accountId: l.accountId, debitCents: l.creditCents, creditCents: l.debitCents })) }, tx);
    }
    await tx.update(creditNotes).set({ balanceCents: 0 }).where(eq(creditNotes.id, cn.id));
  });
  res.json({ ok: true });
});

export default router;
