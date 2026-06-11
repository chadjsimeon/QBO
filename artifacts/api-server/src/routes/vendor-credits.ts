import { Router } from "express";
import {
  db, vendorCredits, vendorCreditLineItems, vendorCreditApplications,
  vendors, bills, journalEntries, journalLines,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { findSystemAccount, postEntry } from "../lib/ledger";
import { getTaxMap, computeLines, sumTotals } from "../lib/documents";

const router = Router();
router.use(requireAuth);

function serialize(c: typeof vendorCredits.$inferSelect, vendorName?: string | null) {
  return { ...c, vendorName: vendorName ?? null, date: c.date.toISOString(), createdAt: c.createdAt.toISOString() };
}

router.get("/vendor-credits", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db.select({ c: vendorCredits, vendorName: vendors.name })
    .from(vendorCredits).leftJoin(vendors, eq(vendorCredits.vendorId, vendors.id))
    .where(eq(vendorCredits.organizationId, orgId)).orderBy(desc(vendorCredits.date));
  res.json(rows.map(r => serialize(r.c, r.vendorName)));
});

router.get("/vendor-credits/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [row] = await db.select({ c: vendorCredits, vendorName: vendors.name })
    .from(vendorCredits).leftJoin(vendors, eq(vendorCredits.vendorId, vendors.id))
    .where(and(eq(vendorCredits.id, req.params.id), eq(vendorCredits.organizationId, orgId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const lines = await db.select().from(vendorCreditLineItems)
    .where(eq(vendorCreditLineItems.vendorCreditId, req.params.id)).orderBy(vendorCreditLineItems.sortOrder);
  const apps = await db.select({ a: vendorCreditApplications, number: bills.number })
    .from(vendorCreditApplications).leftJoin(bills, eq(vendorCreditApplications.billId, bills.id))
    .where(eq(vendorCreditApplications.vendorCreditId, req.params.id));
  res.json({ ...serialize(row.c, row.vendorName), lineItems: lines, applications: apps.map(x => ({ ...x.a, billNumber: x.number })) });
});

router.post("/vendor-credits", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { vendorId, number, date, memo, lines } = req.body;
  if (!vendorId || !number || !date || !lines?.length) { res.status(400).json({ error: "Missing required fields" }); return; }

  const computed = computeLines(lines, await getTaxMap(orgId));
  const { subtotalCents, taxCents, totalCents } = sumTotals(computed);
  if (totalCents <= 0) { res.status(400).json({ error: "Total must be greater than zero" }); return; }

  // Post: debit A/P, credit expense lines (+ sales tax).
  const ap = await findSystemAccount(orgId, "AP");
  const entryLines: Array<{ accountId: string; debitCents: number; creditCents: number }> =
    [{ accountId: ap.id, debitCents: totalCents, creditCents: 0 }];
  for (const l of computed) entryLines.push({ accountId: l.accountId, debitCents: 0, creditCents: l.amountCents });
  if (taxCents > 0) {
    try { const tax = await findSystemAccount(orgId, "SALES_TAX_PAYABLE"); entryLines.push({ accountId: tax.id, debitCents: 0, creditCents: taxCents }); }
    catch { entryLines[1].creditCents += taxCents; }
  }

  const vc = await db.transaction(async (tx) => {
    const [row] = await tx.insert(vendorCredits).values({
      organizationId: orgId, vendorId, number, date: new Date(date), memo: memo || null,
      subtotalCents, taxCents, totalCents, balanceCents: totalCents,
    }).returning();

    await tx.insert(vendorCreditLineItems).values(computed.map((l, i) => ({
      vendorCreditId: row.id, description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents,
      taxRateId: l.taxRateId || null, accountId: l.accountId, amountCents: l.amountCents, sortOrder: i,
    })));

    const entry = await postEntry({ organizationId: orgId, date: new Date(date), memo: memo || `Supplier credit ${number}`, sourceType: "VENDOR_CREDIT", sourceId: row.id, lines: entryLines }, tx);
    await tx.update(vendorCredits).set({ journalEntryId: entry.id }).where(eq(vendorCredits.id, row.id));
    return { ...row, journalEntryId: entry.id };
  });
  res.status(201).json(serialize(vc));
});

router.post("/vendor-credits/:id/apply", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { applications } = req.body as { applications?: Array<{ billId: string; amountCents: number }> };
  const [vc] = await db.select().from(vendorCredits).where(and(eq(vendorCredits.id, req.params.id), eq(vendorCredits.organizationId, orgId)));
  if (!vc) { res.status(404).json({ error: "Not found" }); return; }

  const apps = (applications ?? []).map(a => ({ billId: a.billId, amountCents: Math.round(Number(a.amountCents) || 0) })).filter(a => a.billId && a.amountCents > 0);
  const total = apps.reduce((s, a) => s + a.amountCents, 0);
  if (total <= 0) { res.status(400).json({ error: "Enter an amount to apply." }); return; }
  if (total > vc.balanceCents) { res.status(400).json({ error: "Applied amount exceeds the available credit." }); return; }

  const billIds = apps.map(a => a.billId);
  const rows = await db.select().from(bills).where(and(eq(bills.organizationId, orgId), inArray(bills.id, billIds)));
  const billMap = new Map(rows.map(b => [b.id, b]));
  for (const a of apps) {
    const bill = billMap.get(a.billId);
    if (!bill || bill.vendorId !== vc.vendorId) { res.status(400).json({ error: "Bill not found for this vendor." }); return; }
    if (a.amountCents > bill.balanceCents) { res.status(400).json({ error: `Amount exceeds balance on ${bill.number}.` }); return; }
  }

  await db.transaction(async (tx) => {
    for (const a of apps) {
      const bill = billMap.get(a.billId)!;
      const newBal = bill.balanceCents - a.amountCents;
      await tx.update(bills).set({ balanceCents: newBal, status: newBal <= 0 ? "PAID" : "PARTIAL" }).where(eq(bills.id, a.billId));
      await tx.insert(vendorCreditApplications).values({ vendorCreditId: vc.id, billId: a.billId, amountCents: a.amountCents });
    }
    await tx.update(vendorCredits).set({ balanceCents: vc.balanceCents - total }).where(eq(vendorCredits.id, vc.id));
  });
  res.json({ ok: true, appliedCents: total, remainingCents: vc.balanceCents - total });
});

router.post("/vendor-credits/:id/void", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [vc] = await db.select().from(vendorCredits).where(and(eq(vendorCredits.id, req.params.id), eq(vendorCredits.organizationId, orgId)));
  if (!vc) { res.status(404).json({ error: "Not found" }); return; }
  if (vc.balanceCents !== vc.totalCents) { res.status(400).json({ error: "Cannot void a credit that has been applied." }); return; }

  await db.transaction(async (tx) => {
    const [je] = await tx.select().from(journalEntries).where(and(eq(journalEntries.organizationId, orgId), eq(journalEntries.sourceId, vc.id))).limit(1);
    if (je) {
      const lines = await tx.select().from(journalLines).where(eq(journalLines.journalEntryId, je.id));
      await postEntry({ organizationId: orgId, date: new Date(), memo: `Void supplier credit ${vc.number}`, sourceType: "ADJUSTMENT", isReversal: true, reversedEntryId: je.id, lines: lines.map(l => ({ accountId: l.accountId, debitCents: l.creditCents, creditCents: l.debitCents })) }, tx);
    }
    await tx.update(vendorCredits).set({ balanceCents: 0 }).where(eq(vendorCredits.id, vc.id));
  });
  res.json({ ok: true });
});

export default router;
