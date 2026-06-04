import { Router } from "express";
import { db, bankAccounts, bankTransactions, accounts } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { postEntry } from "../lib/ledger";

const router = Router();

router.use(requireAuth);

function serializeBankAccount(b: typeof bankAccounts.$inferSelect, accountName?: string | null) {
  return {
    ...b,
    accountName: accountName ?? null,
    createdAt: b.createdAt.toISOString(),
    bankBalanceAsOf: b.bankBalanceAsOf?.toISOString() ?? null,
  };
}

function serializeTxn(t: typeof bankTransactions.$inferSelect) {
  return {
    ...t,
    date: t.date.toISOString(),
    importedAt: t.importedAt.toISOString(),
  };
}

router.get("/bank-accounts", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db.select({ ba: bankAccounts, accountName: accounts.name })
    .from(bankAccounts)
    .leftJoin(accounts, eq(bankAccounts.accountId, accounts.id))
    .where(eq(bankAccounts.organizationId, orgId))
    .orderBy(bankAccounts.createdAt);
  res.json(rows.map(r => serializeBankAccount(r.ba, r.accountName)));
});

router.post("/bank-accounts", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { accountId, institutionName, accountMask } = req.body;
  if (!accountId || !institutionName) {
    res.status(400).json({ error: "accountId and institutionName required" }); return;
  }

  const [row] = await db.insert(bankAccounts).values({
    organizationId: orgId,
    accountId,
    institutionName,
    accountMask: accountMask || null,
  }).returning();

  res.status(201).json(serializeBankAccount(row));
});

router.get("/bank-accounts/:id/transactions", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db.select().from(bankTransactions)
    .where(and(
      eq(bankTransactions.bankAccountId, req.params.id),
      eq(bankTransactions.organizationId, orgId),
    ))
    .orderBy(bankTransactions.date);
  res.json(rows.map(serializeTxn));
});

router.post("/bank-accounts/:id/transactions", async (req, res) => {
  const orgId = req.session.organizationId!;
  const bankAccountId = req.params.id;
  const [ba] = await db.select().from(bankAccounts)
    .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.organizationId, orgId)));
  if (!ba) { res.status(404).json({ error: "Not found" }); return; }

  const { csv } = req.body as { csv?: string };
  if (!csv?.trim()) { res.status(400).json({ error: "CSV required" }); return; }

  let imported = 0;
  let skipped = 0;
  const rows = csv.trim().split(/\r?\n/);
  for (const raw of rows) {
    const cells = raw.trim().split(",");
    if (cells.length < 3) { skipped++; continue; }
    const [dateStr, desc, amountStr] = [cells[0], cells.slice(1, -1).join(",") || cells[1], cells[cells.length - 1]];
    const date = new Date(dateStr.trim());
    const amountCents = Math.round(parseFloat(amountStr.trim()) * 100);
    if (isNaN(date.getTime()) || isNaN(amountCents)) { skipped++; continue; }

    await db.insert(bankTransactions).values({
      organizationId: orgId,
      bankAccountId,
      date,
      descriptionRaw: desc.trim(),
      amountCents,
      status: "FOR_REVIEW",
    });
    imported++;
  }

  res.json({ imported, skipped });
});

router.post("/bank-transactions/:id/categorize", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { accountId, memo } = req.body;
  if (!accountId) { res.status(400).json({ error: "accountId required" }); return; }

  const [txn] = await db.select().from(bankTransactions)
    .where(and(eq(bankTransactions.id, req.params.id), eq(bankTransactions.organizationId, orgId)));
  if (!txn) { res.status(404).json({ error: "Not found" }); return; }

  const [ba] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, txn.bankAccountId));
  if (!ba) { res.status(404).json({ error: "Bank account not found" }); return; }

  const moneyIn = txn.amountCents > 0;
  const magnitude = Math.abs(txn.amountCents);

  const je = await postEntry({
    organizationId: orgId,
    date: txn.date,
    memo: memo || txn.descriptionRaw,
    sourceType: "BANK",
    sourceId: txn.id,
    lines: moneyIn ? [
      { accountId: ba.accountId, debitCents: magnitude, creditCents: 0 },
      { accountId: accountId, debitCents: 0, creditCents: magnitude },
    ] : [
      { accountId: accountId, debitCents: magnitude, creditCents: 0 },
      { accountId: ba.accountId, debitCents: 0, creditCents: magnitude },
    ],
  });

  const [updated] = await db.update(bankTransactions).set({
    status: "CATEGORIZED",
    matchType: "ADDED",
    journalEntryId: je.id,
    categorizedAccountId: accountId,
    memo: memo || null,
  }).where(eq(bankTransactions.id, req.params.id)).returning();

  res.json(serializeTxn(updated));
});

export default router;
