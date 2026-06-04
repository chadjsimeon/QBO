import { Router } from "express";
import { db, invoices, invoiceLineItems, customers, taxRates, journalEntries, journalLines } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { findSystemAccount, postEntry } from "../lib/ledger";

const router = Router();

router.use(requireAuth);

function computeLines(lines: Array<{ description: string; quantity: number; unitPriceCents: number; accountId: string; taxRateId?: string | null }>, taxMap: Map<string, number>) {
  return lines.map(l => {
    const amt = l.quantity * l.unitPriceCents;
    const rateBps = l.taxRateId ? (taxMap.get(l.taxRateId) ?? 0) : 0;
    const tax = l.taxRateId ? Math.round(amt * rateBps / 10000) : 0;
    return { ...l, amountCents: amt, taxCents: tax };
  });
}

async function getTaxMap(orgId: string) {
  const rates = await db.select().from(taxRates).where(eq(taxRates.organizationId, orgId));
  return new Map(rates.map(r => [r.id, r.rateBps]));
}

function serializeInvoice(inv: typeof invoices.$inferSelect, customerName?: string | null) {
  return {
    ...inv,
    customerName: customerName ?? null,
    issueDate: inv.issueDate.toISOString(),
    dueDate: inv.dueDate.toISOString(),
    createdAt: inv.createdAt.toISOString(),
  };
}

router.get("/invoices", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db.select({
    inv: invoices,
    customerName: customers.name,
  })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(eq(invoices.organizationId, orgId))
    .orderBy(invoices.issueDate);
  res.json(rows.map(r => serializeInvoice(r.inv, r.customerName)));
});

router.post("/invoices", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { contactId, number, issueDate, dueDate, lines } = req.body;
  if (!contactId || !number || !issueDate || !dueDate || !lines?.length) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }

  const taxMap = await getTaxMap(orgId);
  const computed = computeLines(lines, taxMap);
  const subtotalCents = computed.reduce((s, l) => s + l.amountCents, 0);
  const taxCents = computed.reduce((s, l) => s + l.taxCents, 0);
  const totalCents = subtotalCents + taxCents;

  const [inv] = await db.insert(invoices).values({
    organizationId: orgId,
    customerId: contactId,
    number,
    status: "DRAFT",
    issueDate: new Date(issueDate),
    dueDate: new Date(dueDate),
    subtotalCents,
    taxCents,
    totalCents,
    balanceCents: totalCents,
  }).returning();

  await db.insert(invoiceLineItems).values(computed.map((l, i) => ({
    invoiceId: inv.id,
    description: l.description,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    taxRateId: l.taxRateId || null,
    accountId: l.accountId,
    amountCents: l.amountCents,
    sortOrder: i,
  })));

  res.status(201).json(serializeInvoice(inv));
});

router.get("/invoices/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [row] = await db.select({ inv: invoices, customerName: customers.name })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(and(eq(invoices.id, req.params.id), eq(invoices.organizationId, orgId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const lines = await db.select().from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, req.params.id))
    .orderBy(invoiceLineItems.sortOrder);

  res.json({ ...serializeInvoice(row.inv, row.customerName), lineItems: lines });
});

router.patch("/invoices/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { contactId, number, issueDate, dueDate, lines } = req.body;

  const [existing] = await db.select().from(invoices)
    .where(and(eq(invoices.id, req.params.id), eq(invoices.organizationId, orgId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "DRAFT") { res.status(400).json({ error: "Only DRAFT invoices can be edited" }); return; }

  const taxMap = await getTaxMap(orgId);
  const computed = computeLines(lines, taxMap);
  const subtotalCents = computed.reduce((s, l) => s + l.amountCents, 0);
  const taxCents = computed.reduce((s, l) => s + l.taxCents, 0);
  const totalCents = subtotalCents + taxCents;

  const [inv] = await db.update(invoices).set({
    customerId: contactId,
    number,
    issueDate: new Date(issueDate),
    dueDate: new Date(dueDate),
    subtotalCents,
    taxCents,
    totalCents,
    balanceCents: totalCents,
  }).where(eq(invoices.id, req.params.id)).returning();

  await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, req.params.id));
  await db.insert(invoiceLineItems).values(computed.map((l, i) => ({
    invoiceId: inv.id,
    description: l.description,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    taxRateId: l.taxRateId || null,
    accountId: l.accountId,
    amountCents: l.amountCents,
    sortOrder: i,
  })));

  res.json(serializeInvoice(inv));
});

router.post("/invoices/:id/issue", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [existing] = await db.select().from(invoices)
    .where(and(eq(invoices.id, req.params.id), eq(invoices.organizationId, orgId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "DRAFT") { res.status(400).json({ error: "Only DRAFT invoices can be issued" }); return; }

  const lines = await db.select().from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, existing.id));

  const arAccount = await findSystemAccount(orgId, "ACCOUNTS_RECEIVABLE");
  const incomeAccount = await findSystemAccount(orgId, "SALES_INCOME");

  if (arAccount && incomeAccount) {
    await postEntry({
      organizationId: orgId,
      date: existing.issueDate,
      memo: `${existing.number} issued`,
      sourceType: "INVOICE",
      sourceId: existing.id,
      lines: [
        { accountId: arAccount.id, debitCents: existing.totalCents, creditCents: 0 },
        { accountId: incomeAccount.id, debitCents: 0, creditCents: existing.subtotalCents },
        ...(existing.taxCents > 0 ? [{ accountId: incomeAccount.id, debitCents: 0, creditCents: existing.taxCents }] : []),
      ],
    });
  }

  const [inv] = await db.update(invoices).set({ status: "SENT" })
    .where(eq(invoices.id, req.params.id)).returning();
  res.json(serializeInvoice(inv));
});

router.delete("/invoices/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  await db.delete(invoices)
    .where(and(eq(invoices.id, req.params.id), eq(invoices.organizationId, orgId)));
  res.status(204).send();
});

router.post("/invoices/:id/void", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [existing] = await db.select().from(invoices)
    .where(and(eq(invoices.id, req.params.id), eq(invoices.organizationId, orgId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  if (existing.status !== "VOID") {
    // Reverse any journal entry
    const [je] = await db.select().from(journalEntries)
      .where(and(
        eq(journalEntries.organizationId, orgId),
        eq(journalEntries.sourceType, "INVOICE"),
        eq(journalEntries.sourceId, existing.id)
      )).limit(1);

    if (je) {
      const lines = await db.select().from(journalLines)
        .where(eq(journalLines.journalEntryId, je.id));

      await postEntry({
        organizationId: orgId,
        date: new Date(),
        memo: `Void invoice ${existing.number}`,
        sourceType: "ADJUSTMENT",
        isReversal: true,
        reversedEntryId: je.id,
        lines: lines.map(l => ({
          accountId: l.accountId,
          debitCents: l.creditCents,
          creditCents: l.debitCents,
        })),
      });
    }
  }

  const [inv] = await db.update(invoices).set({ status: "VOID" })
    .where(eq(invoices.id, req.params.id)).returning();
  res.json(serializeInvoice(inv));
});

export default router;
