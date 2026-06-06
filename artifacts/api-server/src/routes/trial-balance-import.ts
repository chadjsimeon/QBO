import { Router } from "express";
import { db, accounts, trialBalanceImports } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { postEntry, findOrCreateOpeningBalanceEquity, getNetDebitByAccount } from "../lib/ledger";

const router = Router();
router.use(requireAuth);

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;
type AccountType = (typeof ACCOUNT_TYPES)[number];

// Common convention: leading digit of the account number maps to a statement type.
function inferType(accountNumber: string, provided?: string): AccountType {
  const up = (provided || "").trim().toUpperCase();
  if ((ACCOUNT_TYPES as readonly string[]).includes(up)) return up as AccountType;
  const first = accountNumber.trim()[0];
  return ({ "1": "ASSET", "2": "LIABILITY", "3": "EQUITY", "4": "INCOME", "5": "EXPENSE" } as Record<string, AccountType>)[first] ?? "EXPENSE";
}

interface ImportRow {
  accountNumber: string; accountName: string;
  debitCents: number; creditCents: number;
  accountType?: string; description?: string;
}

function normalizeRows(raw: any[]): ImportRow[] {
  return (raw ?? []).map(r => ({
    accountNumber: String(r.accountNumber ?? "").trim(),
    accountName: String(r.accountName ?? "").trim(),
    debitCents: Number.isFinite(r.debitCents) ? Math.round(r.debitCents) : 0,
    creditCents: Number.isFinite(r.creditCents) ? Math.round(r.creditCents) : 0,
    accountType: r.accountType ? String(r.accountType) : undefined,
    description: r.description ? String(r.description) : undefined,
  }));
}

// Dry run: classify each row (create vs match), validate, and check that the
// imported trial balance is itself balanced.
router.post("/trial-balance/import/analyze", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = normalizeRows(req.body?.rows);
  if (!rows.length) { res.status(400).json({ error: "No rows to analyze" }); return; }

  const existing = await db.select().from(accounts).where(eq(accounts.organizationId, orgId));
  const byCode = new Map(existing.map(a => [a.code, a]));

  const seen = new Map<string, number>();
  let createCount = 0, matchCount = 0, errorCount = 0;
  let totalDebitsCents = 0, totalCreditsCents = 0;

  const results = rows.map((r, index) => {
    const errors: string[] = [];
    if (!r.accountNumber) errors.push("Missing account number");
    if (!r.accountName) errors.push("Missing account name");
    if (r.debitCents < 0 || r.creditCents < 0) errors.push("Amounts must be positive");
    if (r.debitCents > 0 && r.creditCents > 0) errors.push("Row has both a debit and a credit");

    if (r.accountNumber) {
      const prev = seen.get(r.accountNumber);
      if (prev !== undefined) errors.push(`Duplicate of row ${prev + 1} in this file`);
      else seen.set(r.accountNumber, index);
    }

    const match = r.accountNumber ? byCode.get(r.accountNumber) : undefined;
    const status = errors.length ? "error" : match ? "match" : "create";
    if (status === "create") createCount++;
    else if (status === "match") matchCount++;
    else errorCount++;

    if (!errors.length) { totalDebitsCents += r.debitCents; totalCreditsCents += r.creditCents; }

    return {
      index, accountNumber: r.accountNumber, accountName: r.accountName,
      debitCents: r.debitCents, creditCents: r.creditCents,
      type: inferType(r.accountNumber, r.accountType),
      status,
      existingAccountId: match?.id ?? null,
      existingName: match?.name ?? null,
      errors,
    };
  });

  const differenceCents = totalDebitsCents - totalCreditsCents;
  res.json({
    results, createCount, matchCount, errorCount,
    totalDebitsCents, totalCreditsCents,
    balanced: differenceCents === 0,
    differenceCents,
  });
});

// Commit: create/update accounts and post one opening-balance journal entry that
// brings each account to its imported balance as of the effective date.
router.post("/trial-balance/import/commit", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { effectiveDate, fileName, duplicateStrategy } = req.body as {
    effectiveDate?: string; fileName?: string; duplicateStrategy?: "skip" | "overwrite" | "balances";
  };
  const rows = normalizeRows(req.body?.rows);
  if (!rows.length) { res.status(400).json({ error: "No rows to import" }); return; }
  const effDate = effectiveDate ? new Date(effectiveDate) : new Date();
  if (isNaN(effDate.getTime())) { res.status(400).json({ error: "Invalid effective date" }); return; }
  const strategy = duplicateStrategy ?? "balances";

  const existing = await db.select().from(accounts).where(eq(accounts.organizationId, orgId));
  const byCode = new Map(existing.map(a => [a.code, a]));
  const currentNet = await getNetDebitByAccount(orgId, { lte: effDate });

  let accountsCreated = 0, accountsMatched = 0, accountsSkipped = 0;
  let totalDebitsCents = 0, totalCreditsCents = 0;
  const failures: Array<{ index: number; reason: string }> = [];
  const lines: Array<{ accountId: string; debitCents: number; creditCents: number }> = [];
  const dealt = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.accountNumber || !r.accountName) { failures.push({ index: i, reason: "Missing account number or name" }); continue; }
    if (r.debitCents > 0 && r.creditCents > 0) { failures.push({ index: i, reason: "Both debit and credit" }); continue; }
    if (dealt.has(r.accountNumber)) { failures.push({ index: i, reason: "Duplicate account number in file" }); continue; }
    dealt.add(r.accountNumber);

    const type = inferType(r.accountNumber, r.accountType);
    let acct = byCode.get(r.accountNumber);

    try {
      if (acct) {
        accountsMatched++;
        if (strategy === "skip") { accountsSkipped++; continue; }
        if (strategy === "overwrite") {
          await db.update(accounts).set({ name: r.accountName, type, description: r.description?.trim() || null })
            .where(eq(accounts.id, acct.id));
        }
        // "balances" and "overwrite" both (re)set the opening balance below.
      } else {
        const sortOrder = Number.isFinite(Number(r.accountNumber)) ? Math.min(Number(r.accountNumber), 99999) : 9000 + i;
        const [created] = await db.insert(accounts).values({
          organizationId: orgId,
          code: r.accountNumber,
          name: r.accountName,
          type,
          subtype: "general",
          description: r.description?.trim() || null,
          cashFlowCategory: "NONE",
          sortOrder,
        }).returning();
        acct = created;
        byCode.set(r.accountNumber, created);
        accountsCreated++;
      }

      totalDebitsCents += r.debitCents;
      totalCreditsCents += r.creditCents;

      // Post the difference between the imported balance and the account's current
      // balance, so the account lands exactly on target (and re-imports are no-ops).
      const target = r.debitCents - r.creditCents;
      const current = currentNet.get(acct.id) ?? 0;
      const delta = target - current;
      if (delta !== 0) {
        lines.push({ accountId: acct.id, debitCents: delta > 0 ? delta : 0, creditCents: delta < 0 ? -delta : 0 });
      }
    } catch (e: any) {
      failures.push({ index: i, reason: e?.message || "Failed to process row" });
    }
  }

  const balanced = totalDebitsCents === totalCreditsCents;

  // Record the import first so we can tag the journal entry to it.
  const importedByName = req.session.name || req.session.email || null;
  const [imp] = await db.insert(trialBalanceImports).values({
    organizationId: orgId,
    effectiveDate: effDate,
    fileName: fileName || null,
    totalAccounts: rows.length,
    accountsCreated, accountsMatched,
    totalDebitsCents, totalCreditsCents,
    balanced,
    status: "COMPLETED",
    importedByName,
  }).returning();

  // Plug any residual to Opening Balance Equity so the journal entry balances.
  let journalEntryId: string | null = null;
  const residual = lines.reduce((s, l) => s + l.debitCents - l.creditCents, 0);
  if (residual !== 0) {
    const obe = await findOrCreateOpeningBalanceEquity(orgId);
    lines.push({ accountId: obe.id, debitCents: residual < 0 ? -residual : 0, creditCents: residual > 0 ? residual : 0 });
  }
  if (lines.length >= 2) {
    const entry = await postEntry({
      organizationId: orgId,
      date: effDate,
      memo: `Trial balance import${fileName ? ` — ${fileName}` : ""}`,
      sourceType: "ADJUSTMENT",
      sourceId: imp.id,
      lines,
    });
    journalEntryId = entry.id;
    await db.update(trialBalanceImports).set({ journalEntryId }).where(eq(trialBalanceImports.id, imp.id));
  }

  res.status(201).json({
    importId: imp.id,
    accountsCreated, accountsMatched, accountsSkipped,
    failed: failures.length, failures,
    totalDebitsCents, totalCreditsCents, balanced,
    journalEntryId,
    effectiveDate: effDate.toISOString(),
  });
});

export default router;
