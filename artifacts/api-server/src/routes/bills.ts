import { Router } from "express";
import { db, bills, billLineItems, vendors, taxRates, accounts, journalEntries, journalLines } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { postEntry } from "../lib/ledger";

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

function serializeBill(b: typeof bills.$inferSelect, vendorName?: string | null) {
  return {
    ...b,
    vendorName: vendorName ?? null,
    issueDate: b.issueDate.toISOString(),
    dueDate: b.dueDate.toISOString(),
    createdAt: b.createdAt.toISOString(),
  };
}

router.get("/bills", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db.select({ bill: bills, vendorName: vendors.name })
    .from(bills)
    .leftJoin(vendors, eq(bills.vendorId, vendors.id))
    .where(eq(bills.organizationId, orgId))
    .orderBy(bills.issueDate);
  res.json(rows.map(r => serializeBill(r.bill, r.vendorName)));
});

router.post("/bills", async (req, res) => {
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

  const [bill] = await db.insert(bills).values({
    organizationId: orgId,
    vendorId: contactId,
    number,
    status: "DRAFT",
    issueDate: new Date(issueDate),
    dueDate: new Date(dueDate),
    subtotalCents,
    taxCents,
    totalCents,
    balanceCents: totalCents,
  }).returning();

  await db.insert(billLineItems).values(computed.map((l, i) => ({
    billId: bill.id,
    description: l.description,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    taxRateId: l.taxRateId || null,
    accountId: l.accountId,
    amountCents: l.amountCents,
    sortOrder: i,
  })));

  res.status(201).json(serializeBill(bill));
});

router.get("/bills/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [row] = await db.select({ bill: bills, vendorName: vendors.name })
    .from(bills)
    .leftJoin(vendors, eq(bills.vendorId, vendors.id))
    .where(and(eq(bills.id, req.params.id), eq(bills.organizationId, orgId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const lines = await db.select().from(billLineItems)
    .where(eq(billLineItems.billId, req.params.id))
    .orderBy(billLineItems.sortOrder);

  res.json({ ...serializeBill(row.bill, row.vendorName), lineItems: lines });
});

router.patch("/bills/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { contactId, number, issueDate, dueDate, lines } = req.body;

  const [existing] = await db.select().from(bills)
    .where(and(eq(bills.id, req.params.id), eq(bills.organizationId, orgId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "DRAFT") { res.status(400).json({ error: "Only DRAFT bills can be edited" }); return; }

  const taxMap = await getTaxMap(orgId);
  const computed = computeLines(lines, taxMap);
  const subtotalCents = computed.reduce((s, l) => s + l.amountCents, 0);
  const taxCents = computed.reduce((s, l) => s + l.taxCents, 0);
  const totalCents = subtotalCents + taxCents;

  const [bill] = await db.update(bills).set({
    vendorId: contactId,
    number,
    issueDate: new Date(issueDate),
    dueDate: new Date(dueDate),
    subtotalCents,
    taxCents,
    totalCents,
    balanceCents: totalCents,
  }).where(eq(bills.id, req.params.id)).returning();

  await db.delete(billLineItems).where(eq(billLineItems.billId, req.params.id));
  await db.insert(billLineItems).values(computed.map((l, i) => ({
    billId: bill.id,
    description: l.description,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    taxRateId: l.taxRateId || null,
    accountId: l.accountId,
    amountCents: l.amountCents,
    sortOrder: i,
  })));

  res.json(serializeBill(bill));
});

router.delete("/bills/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  await db.delete(bills)
    .where(and(eq(bills.id, req.params.id), eq(bills.organizationId, orgId)));
  res.status(204).send();
});

router.post("/bills/:id/enter", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [existing] = await db.select().from(bills)
    .where(and(eq(bills.id, req.params.id), eq(bills.organizationId, orgId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "DRAFT") { res.status(400).json({ error: "Only DRAFT bills can be entered" }); return; }

  const lines = await db.select().from(billLineItems)
    .where(eq(billLineItems.billId, existing.id));

  // Find AP account (systemRole = "AP") and first expense account
  const [apAccount] = await db.select().from(accounts)
    .where(and(eq(accounts.organizationId, orgId), eq(accounts.systemRole, "AP")));
  const [expenseAccount] = await db.select().from(accounts)
    .where(and(
      eq(accounts.organizationId, orgId),
      eq(accounts.type, "EXPENSE"),
      // @ts-ignore
      eq(accounts.subtype as any, "expense")
    ));

  if (apAccount && expenseAccount) {
    const entryLines: Array<{ accountId: string; debitCents: number; creditCents: number }> = [
      { accountId: expenseAccount.id, debitCents: existing.subtotalCents, creditCents: 0 },
      { accountId: apAccount.id, debitCents: 0, creditCents: existing.totalCents },
    ];
    if (existing.taxCents > 0) {
      const [taxAccount] = await db.select().from(accounts)
        .where(and(eq(accounts.organizationId, orgId), eq(accounts.systemRole, "SALES_TAX_PAYABLE")));
      entryLines.push({ accountId: (taxAccount ?? expenseAccount).id, debitCents: existing.taxCents, creditCents: 0 });
    }
    await postEntry({
      organizationId: orgId,
      date: existing.issueDate,
      memo: `${existing.number} entered`,
      sourceType: "BILL",
      sourceId: existing.id,
      lines: entryLines,
    });
  }

  const [bill] = await db.update(bills).set({ status: "OPEN" })
    .where(eq(bills.id, req.params.id)).returning();
  res.json(serializeBill(bill));
});

router.post("/bills/:id/void", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [existing] = await db.select().from(bills)
    .where(and(eq(bills.id, req.params.id), eq(bills.organizationId, orgId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  if (existing.status !== "VOID" && existing.status !== "DRAFT") {
    // Reverse the journal entry if one exists
    const [je] = await db.select().from(journalEntries)
      .where(and(
        eq(journalEntries.organizationId, orgId),
        eq(journalEntries.sourceType, "BILL"),
        eq(journalEntries.sourceId, existing.id)
      )).limit(1);

    if (je) {
      const jeLines = await db.select().from(journalLines)
        .where(eq(journalLines.journalEntryId, je.id));
      await postEntry({
        organizationId: orgId,
        date: new Date(),
        memo: `Void bill ${existing.number}`,
        sourceType: "ADJUSTMENT",
        isReversal: true,
        reversedEntryId: je.id,
        lines: jeLines.map(l => ({ accountId: l.accountId, debitCents: l.creditCents, creditCents: l.debitCents })),
      });
    }
  }

  const [bill] = await db.update(bills).set({ status: "VOID", balanceCents: 0 })
    .where(eq(bills.id, req.params.id)).returning();
  res.json(serializeBill(bill));
});

export default router;
