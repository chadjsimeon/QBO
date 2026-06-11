import { Router } from "express";
import {
  db,
  salesReceipts,
  salesReceiptLineItems,
  customers,
  accounts,
  journalEntries,
  journalLines,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { findSystemAccount, postEntry } from "../lib/ledger";
import { getTaxMap, computeLines, sumTotals } from "../lib/documents";

const router = Router();
router.use(requireAuth);

function serialize(
  r: typeof salesReceipts.$inferSelect,
  customerName?: string | null,
  depositAccountName?: string | null,
) {
  return {
    ...r,
    customerName: customerName ?? null,
    depositAccountName: depositAccountName ?? null,
    date: r.date.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/sales-receipts", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db
    .select({ r: salesReceipts, customerName: customers.name, acctName: accounts.name })
    .from(salesReceipts)
    .leftJoin(customers, eq(salesReceipts.customerId, customers.id))
    .leftJoin(accounts, eq(salesReceipts.depositAccountId, accounts.id))
    .where(eq(salesReceipts.organizationId, orgId))
    .orderBy(desc(salesReceipts.date));
  res.json(rows.map((r) => serialize(r.r, r.customerName, r.acctName)));
});

router.get("/sales-receipts/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [row] = await db
    .select({ r: salesReceipts, customerName: customers.name, acctName: accounts.name })
    .from(salesReceipts)
    .leftJoin(customers, eq(salesReceipts.customerId, customers.id))
    .leftJoin(accounts, eq(salesReceipts.depositAccountId, accounts.id))
    .where(and(eq(salesReceipts.id, req.params.id), eq(salesReceipts.organizationId, orgId)));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const lines = await db
    .select()
    .from(salesReceiptLineItems)
    .where(eq(salesReceiptLineItems.salesReceiptId, req.params.id))
    .orderBy(salesReceiptLineItems.sortOrder);
  res.json({ ...serialize(row.r, row.customerName, row.acctName), lineItems: lines });
});

router.post("/sales-receipts", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { customerId, depositAccountId, number, isRefund, date, memo, lines } = req.body;
  if (!depositAccountId || !number || !date || !lines?.length) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const computed = computeLines(lines, await getTaxMap(orgId));
  const { subtotalCents, taxCents, totalCents } = sumTotals(computed);
  if (totalCents <= 0) {
    res.status(400).json({ error: "Total must be greater than zero" });
    return;
  }

  // Build the income/tax legs, then place cash on the correct side.
  let taxAccountId: string | null = null;
  if (taxCents > 0) {
    try {
      taxAccountId = (await findSystemAccount(orgId, "SALES_TAX_PAYABLE")).id;
    } catch {
      taxAccountId = null;
    }
  }

  const incomeLegs: Array<{ accountId: string; cents: number }> = computed.map((l) => ({
    accountId: l.accountId,
    cents: l.amountCents,
  }));
  if (taxCents > 0)
    incomeLegs.push({ accountId: taxAccountId ?? computed[0].accountId, cents: taxCents });

  const entryLines: Array<{ accountId: string; debitCents: number; creditCents: number }> = [];
  if (isRefund) {
    // Refund (money out): debit income/tax, credit deposit account.
    for (const leg of incomeLegs)
      entryLines.push({ accountId: leg.accountId, debitCents: leg.cents, creditCents: 0 });
    entryLines.push({ accountId: depositAccountId, debitCents: 0, creditCents: totalCents });
  } else {
    // Sale (money in): debit deposit account, credit income/tax.
    entryLines.push({ accountId: depositAccountId, debitCents: totalCents, creditCents: 0 });
    for (const leg of incomeLegs)
      entryLines.push({ accountId: leg.accountId, debitCents: 0, creditCents: leg.cents });
  }

  const sr = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(salesReceipts)
      .values({
        organizationId: orgId,
        customerId: customerId || null,
        depositAccountId,
        number,
        isRefund: !!isRefund,
        date: new Date(date),
        memo: memo || null,
        subtotalCents,
        taxCents,
        totalCents,
      })
      .returning();

    await tx.insert(salesReceiptLineItems).values(
      computed.map((l, i) => ({
        salesReceiptId: row.id,
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        taxRateId: l.taxRateId || null,
        accountId: l.accountId,
        amountCents: l.amountCents,
        sortOrder: i,
      })),
    );

    const entry = await postEntry(
      {
        organizationId: orgId,
        date: new Date(date),
        memo: memo || `${isRefund ? "Refund" : "Sales receipt"} ${number}`,
        sourceType: isRefund ? "REFUND_RECEIPT" : "SALES_RECEIPT",
        sourceId: row.id,
        lines: entryLines,
      },
      tx,
    );
    await tx
      .update(salesReceipts)
      .set({ journalEntryId: entry.id })
      .where(eq(salesReceipts.id, row.id));

    return { ...row, journalEntryId: entry.id };
  });

  res.status(201).json(serialize(sr));
});

router.post("/sales-receipts/:id/void", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [sr] = await db
    .select()
    .from(salesReceipts)
    .where(and(eq(salesReceipts.id, req.params.id), eq(salesReceipts.organizationId, orgId)));
  if (!sr) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [je] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.organizationId, orgId), eq(journalEntries.sourceId, sr.id)))
    .limit(1);
  if (je) {
    const lines = await db
      .select()
      .from(journalLines)
      .where(eq(journalLines.journalEntryId, je.id));
    await postEntry({
      organizationId: orgId,
      date: new Date(),
      memo: `Void ${sr.number}`,
      sourceType: "ADJUSTMENT",
      isReversal: true,
      reversedEntryId: je.id,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        debitCents: l.creditCents,
        creditCents: l.debitCents,
      })),
    });
  }
  res.json({ ok: true });
});

export default router;
