import { Router } from "express";
import { db, expenses, expenseLineItems, vendors, accounts, journalEntries, journalLines } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { findSystemAccount, postEntry } from "../lib/ledger";
import { getTaxMap, computeLines, sumTotals } from "../lib/documents";

const router = Router();
router.use(requireAuth);

function serialize(e: typeof expenses.$inferSelect, vendorName?: string | null, paymentAccountName?: string | null) {
  return {
    ...e,
    vendorName: vendorName ?? null,
    paymentAccountName: paymentAccountName ?? null,
    date: e.date.toISOString(),
    createdAt: e.createdAt.toISOString(),
  };
}

router.get("/expenses", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db.select({ e: expenses, vendorName: vendors.name, acctName: accounts.name })
    .from(expenses)
    .leftJoin(vendors, eq(expenses.vendorId, vendors.id))
    .leftJoin(accounts, eq(expenses.paymentAccountId, accounts.id))
    .where(eq(expenses.organizationId, orgId))
    .orderBy(desc(expenses.date));
  res.json(rows.map(r => serialize(r.e, r.vendorName, r.acctName)));
});

router.get("/expenses/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [row] = await db.select({ e: expenses, vendorName: vendors.name, acctName: accounts.name })
    .from(expenses)
    .leftJoin(vendors, eq(expenses.vendorId, vendors.id))
    .leftJoin(accounts, eq(expenses.paymentAccountId, accounts.id))
    .where(and(eq(expenses.id, req.params.id), eq(expenses.organizationId, orgId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const lines = await db.select().from(expenseLineItems)
    .where(eq(expenseLineItems.expenseId, req.params.id))
    .orderBy(expenseLineItems.sortOrder);
  res.json({ ...serialize(row.e, row.vendorName, row.acctName), lineItems: lines });
});

router.post("/expenses", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { vendorId, paymentAccountId, number, refNumber, method, date, memo, lines, isCredit } = req.body;
  if (!paymentAccountId || !number || !date || !lines?.length) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }

  const computed = computeLines(lines, await getTaxMap(orgId));
  const { subtotalCents, taxCents, totalCents } = sumTotals(computed);
  if (totalCents <= 0) { res.status(400).json({ error: "Total must be greater than zero" }); return; }

  const [exp] = await db.insert(expenses).values({
    organizationId: orgId,
    vendorId: vendorId || null,
    paymentAccountId,
    number,
    refNumber: refNumber || null,
    method: method || "BANK_TRANSFER",
    isCredit: !!isCredit,
    date: new Date(date),
    memo: memo || null,
    subtotalCents, taxCents, totalCents,
  }).returning();

  await db.insert(expenseLineItems).values(computed.map((l, i) => ({
    expenseId: exp.id,
    description: l.description,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    taxRateId: l.taxRateId || null,
    accountId: l.accountId,
    amountCents: l.amountCents,
    sortOrder: i,
  })));

  // Expense: debit expense lines (+tax), credit the paid-from account.
  // Credit card credit (isCredit): the reverse — debit the card, credit expense lines (+tax).
  let taxAccountId: string | null = null;
  if (taxCents > 0) { try { taxAccountId = (await findSystemAccount(orgId, "SALES_TAX_PAYABLE")).id; } catch { taxAccountId = null; } }

  const entryLines: Array<{ accountId: string; debitCents: number; creditCents: number }> = [];
  if (isCredit) {
    entryLines.push({ accountId: paymentAccountId, debitCents: totalCents, creditCents: 0 });
    for (const l of computed) entryLines.push({ accountId: l.accountId, debitCents: 0, creditCents: l.amountCents });
    if (taxCents > 0) entryLines.push({ accountId: taxAccountId ?? computed[0].accountId, debitCents: 0, creditCents: taxCents });
  } else {
    for (const l of computed) entryLines.push({ accountId: l.accountId, debitCents: l.amountCents, creditCents: 0 });
    if (taxCents > 0) entryLines.push({ accountId: taxAccountId ?? computed[0].accountId, debitCents: taxCents, creditCents: 0 });
    entryLines.push({ accountId: paymentAccountId, debitCents: 0, creditCents: totalCents });
  }

  const entry = await postEntry({
    organizationId: orgId,
    date: new Date(date),
    memo: memo || `${isCredit ? "Credit card credit" : "Expense"} ${number}`,
    sourceType: isCredit ? "CC_CREDIT" : "EXPENSE",
    sourceId: exp.id,
    lines: entryLines,
  });
  await db.update(expenses).set({ journalEntryId: entry.id }).where(eq(expenses.id, exp.id));

  res.status(201).json(serialize({ ...exp, journalEntryId: entry.id }));
});

router.post("/expenses/:id/void", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [exp] = await db.select().from(expenses)
    .where(and(eq(expenses.id, req.params.id), eq(expenses.organizationId, orgId)));
  if (!exp) { res.status(404).json({ error: "Not found" }); return; }

  const [je] = await db.select().from(journalEntries)
    .where(and(eq(journalEntries.organizationId, orgId), eq(journalEntries.sourceType, "EXPENSE"), eq(journalEntries.sourceId, exp.id)))
    .limit(1);
  if (je) {
    const lines = await db.select().from(journalLines).where(eq(journalLines.journalEntryId, je.id));
    await postEntry({
      organizationId: orgId,
      date: new Date(),
      memo: `Void expense ${exp.number}`,
      sourceType: "ADJUSTMENT",
      isReversal: true,
      reversedEntryId: je.id,
      lines: lines.map(l => ({ accountId: l.accountId, debitCents: l.creditCents, creditCents: l.debitCents })),
    });
  }
  res.json({ ok: true });
});

export default router;
