import { Router } from "express";
import { db, bankAccounts, bankTransactions, accounts, invoices, bills, customers, vendors, journalEntries, journalLines } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { CreateBankAccountBody, ImportBankTransactionsBody, CategorizeBankTransactionBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/session";
import { postEntry, getNetDebitByAccount } from "../lib/ledger";
import { validateBody } from "../lib/validate";

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

// Post a bank transaction to the ledger against a chosen category account and flip
// it to CATEGORIZED. Deposit (money in) → Dr bank / Cr category; payment (money out)
// → Dr category / Cr bank. Returns the updated row (not serialized).
async function categorizeTxn(
  orgId: string,
  txn: typeof bankTransactions.$inferSelect,
  ba: typeof bankAccounts.$inferSelect,
  accountId: string,
  memo?: string | null,
) {
  const moneyIn = txn.amountCents > 0;
  const magnitude = Math.abs(txn.amountCents);

  return db.transaction(async (tx) => {
    const je = await postEntry({
      organizationId: orgId,
      date: txn.date,
      memo: memo || txn.descriptionRaw,
      sourceType: "BANK",
      sourceId: txn.id,
      lines: moneyIn ? [
        { accountId: ba.accountId, debitCents: magnitude, creditCents: 0 },
        { accountId, debitCents: 0, creditCents: magnitude },
      ] : [
        { accountId, debitCents: magnitude, creditCents: 0 },
        { accountId: ba.accountId, debitCents: 0, creditCents: magnitude },
      ],
    }, tx);

    const [updated] = await tx.update(bankTransactions).set({
      status: "CATEGORIZED",
      matchType: "ADDED",
      journalEntryId: je.id,
      categorizedAccountId: accountId,
      memo: memo || null,
    }).where(eq(bankTransactions.id, txn.id)).returning();

    return updated;
  });
}

router.get("/bank-accounts", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db.select({ ba: bankAccounts, accountName: accounts.name })
    .from(bankAccounts)
    .leftJoin(accounts, eq(bankAccounts.accountId, accounts.id))
    .where(eq(bankAccounts.organizationId, orgId))
    .orderBy(bankAccounts.createdAt);

  // For-review counts per bank account, for the "N to review" badge.
  const counts = await db.select({
    bankAccountId: bankTransactions.bankAccountId,
    count: sql<number>`count(*)::int`,
  })
    .from(bankTransactions)
    .where(and(eq(bankTransactions.organizationId, orgId), eq(bankTransactions.status, "FOR_REVIEW")))
    .groupBy(bankTransactions.bankAccountId);
  const countByAccount = new Map(counts.map(c => [c.bankAccountId, c.count]));

  // Book (GL) balance per linked account. `bankBalanceCents` is only set by a bank
  // feed's statement balance, which CSV import never provides — so it stays 0. The
  // meaningful figure is the ledger balance of the linked GL (asset) account, which
  // equals its net debit (debits − credits) across all posted journal lines.
  const netDebit = await getNetDebitByAccount(orgId, {});

  res.json(rows.map(r => ({
    ...serializeBankAccount(r.ba, r.accountName),
    forReviewCount: countByAccount.get(r.ba.id) ?? 0,
    bookBalanceCents: netDebit.get(r.ba.accountId) ?? 0,
  })));
});

router.post("/bank-accounts", validateBody(CreateBankAccountBody), async (req, res) => {
  const orgId = req.session.organizationId!;
  const { accountId, institutionName, accountMask } = req.body;

  const [row] = await db.insert(bankAccounts).values({
    organizationId: orgId,
    accountId,
    institutionName,
    accountMask: accountMask || null,
  }).returning();

  res.status(201).json(serializeBankAccount(row));
});

// Auto-connect: look up or create a bank_accounts row for a CoA account.
// Used by the import wizard so users don't need a manual "Connect" step first.
router.post("/bank-accounts/ensure", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { accountId } = req.body as { accountId?: string };
  if (!accountId) { res.status(400).json({ error: "accountId required" }); return; }

  const [existing] = await db.select({ ba: bankAccounts, accountName: accounts.name })
    .from(bankAccounts)
    .leftJoin(accounts, eq(bankAccounts.accountId, accounts.id))
    .where(and(eq(bankAccounts.accountId, accountId), eq(bankAccounts.organizationId, orgId)));
  if (existing) { res.json(serializeBankAccount(existing.ba, existing.accountName)); return; }

  const [acct] = await db.select().from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.organizationId, orgId)));
  if (!acct) { res.status(404).json({ error: "Account not found" }); return; }

  const [row] = await db.insert(bankAccounts).values({
    organizationId: orgId,
    accountId,
    institutionName: acct.name,
  }).returning();

  res.json(serializeBankAccount(row, acct.name));
});

// CoA accounts with bank-type subtypes that haven't been connected yet
router.get("/bank-accounts/unlinked", async (req, res) => {
  const orgId = req.session.organizationId!;
  const linked = await db.select({ accountId: bankAccounts.accountId })
    .from(bankAccounts)
    .where(eq(bankAccounts.organizationId, orgId));
  const linkedIds = linked.map(r => r.accountId);

  const BANKING_SUBTYPES = ["bank", "savings", "credit_card"];
  const rows = await db.select().from(accounts)
    .where(eq(accounts.organizationId, orgId))
    .orderBy(accounts.sortOrder, accounts.code);

  const unlinked = rows.filter(
    a => BANKING_SUBTYPES.includes(a.subtype) && !linkedIds.includes(a.id)
  );
  res.json(unlinked.map(a => ({ id: a.id, code: a.code, name: a.name, subtype: a.subtype })));
});

router.get("/bank-accounts/:id/transactions", async (req, res) => {
  const orgId = req.session.organizationId!;
  const status = req.query.status as string | undefined;
  const validStatus = status === "FOR_REVIEW" || status === "CATEGORIZED" || status === "EXCLUDED";
  const rows = await db.select().from(bankTransactions)
    .where(and(
      eq(bankTransactions.bankAccountId, req.params.id),
      eq(bankTransactions.organizationId, orgId),
      validStatus ? eq(bankTransactions.status, status as "FOR_REVIEW" | "CATEGORIZED" | "EXCLUDED") : undefined,
    ))
    .orderBy(bankTransactions.date);
  res.json(rows.map(serializeTxn));
});

router.post("/bank-accounts/:id/transactions", validateBody(ImportBankTransactionsBody), async (req, res) => {
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

router.post("/bank-transactions/:id/categorize", validateBody(CategorizeBankTransactionBody), async (req, res) => {
  const orgId = req.session.organizationId!;
  const { accountId, memo } = req.body;

  const [txn] = await db.select().from(bankTransactions)
    .where(and(eq(bankTransactions.id, req.params.id), eq(bankTransactions.organizationId, orgId)));
  if (!txn) { res.status(404).json({ error: "Not found" }); return; }
  if (txn.status === "CATEGORIZED") { res.status(409).json({ error: "Already categorized" }); return; }

  const [ba] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, txn.bankAccountId));
  if (!ba) { res.status(404).json({ error: "Bank account not found" }); return; }

  const updated = await categorizeTxn(orgId, txn, ba, accountId, memo);
  res.json(serializeTxn(updated));
});

// Categorize many FOR_REVIEW transactions to the same account at once.
router.post("/bank-transactions/bulk-categorize", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { ids, accountId, memo } = req.body as { ids?: string[]; accountId?: string; memo?: string };
  if (!accountId) { res.status(400).json({ error: "accountId required" }); return; }
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids required" }); return; }

  const rows = await db.select().from(bankTransactions)
    .where(and(
      eq(bankTransactions.organizationId, orgId),
      inArray(bankTransactions.id, ids),
      eq(bankTransactions.status, "FOR_REVIEW"),
    ));

  const baCache = new Map<string, typeof bankAccounts.$inferSelect>();
  const updated: ReturnType<typeof serializeTxn>[] = [];
  for (const txn of rows) {
    let ba = baCache.get(txn.bankAccountId);
    if (!ba) {
      [ba] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, txn.bankAccountId));
      if (ba) baCache.set(txn.bankAccountId, ba);
    }
    if (!ba) continue;
    const row = await categorizeTxn(orgId, txn, ba, accountId, memo);
    updated.push(serializeTxn(row));
  }

  res.json({ categorized: updated.length, transactions: updated });
});

// Mark a transaction as excluded (skipped, never posted to the ledger).
router.post("/bank-transactions/:id/exclude", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [txn] = await db.select().from(bankTransactions)
    .where(and(eq(bankTransactions.id, req.params.id), eq(bankTransactions.organizationId, orgId)));
  if (!txn) { res.status(404).json({ error: "Not found" }); return; }
  if (txn.status === "CATEGORIZED") { res.status(409).json({ error: "Undo the categorization before excluding" }); return; }

  const [updated] = await db.update(bankTransactions).set({ status: "EXCLUDED" })
    .where(eq(bankTransactions.id, req.params.id)).returning();
  res.json(serializeTxn(updated));
});

// Revert a transaction back to FOR_REVIEW. Reverses any posted journal entry and
// restores any matched invoice/bill balance.
router.post("/bank-transactions/:id/undo", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [txn] = await db.select().from(bankTransactions)
    .where(and(eq(bankTransactions.id, req.params.id), eq(bankTransactions.organizationId, orgId)));
  if (!txn) { res.status(404).json({ error: "Not found" }); return; }

  const updated = await db.transaction(async (tx) => {
    if (txn.journalEntryId) {
      const jeLines = await tx.select().from(journalLines)
        .where(eq(journalLines.journalEntryId, txn.journalEntryId));
      if (jeLines.length > 0) {
        await postEntry({
          organizationId: orgId,
          date: new Date(),
          memo: "Reversal of bank categorization",
          sourceType: "ADJUSTMENT",
          isReversal: true,
          reversedEntryId: txn.journalEntryId,
          lines: jeLines.map(l => ({ accountId: l.accountId, debitCents: l.creditCents, creditCents: l.debitCents })),
        }, tx);
      }
    }

    // Restore a matched document balance (mirror of the payment-vs-document logic).
    if (txn.matchedInvoiceId) {
      const [inv] = await tx.select().from(invoices)
        .where(and(eq(invoices.id, txn.matchedInvoiceId), eq(invoices.organizationId, orgId)));
      if (inv) {
        const restored = inv.balanceCents + Math.abs(txn.amountCents);
        await tx.update(invoices).set({
          balanceCents: restored,
          status: restored >= inv.totalCents ? "SENT" : "PARTIAL",
        }).where(eq(invoices.id, txn.matchedInvoiceId));
      }
    } else if (txn.matchedBillId) {
      const [bill] = await tx.select().from(bills)
        .where(and(eq(bills.id, txn.matchedBillId), eq(bills.organizationId, orgId)));
      if (bill) {
        const restored = bill.balanceCents + Math.abs(txn.amountCents);
        await tx.update(bills).set({
          balanceCents: restored,
          status: restored >= bill.totalCents ? "OPEN" : "PARTIAL",
        }).where(eq(bills.id, txn.matchedBillId));
      }
    }

    const [row] = await tx.update(bankTransactions).set({
      status: "FOR_REVIEW",
      matchType: null,
      journalEntryId: null,
      categorizedAccountId: null,
      matchedInvoiceId: null,
      matchedBillId: null,
    }).where(eq(bankTransactions.id, req.params.id)).returning();
    return row;
  });
  res.json(serializeTxn(updated));
});

// Accept an invoice/bill match: post against AR/AP and pay down the document.
router.post("/bank-transactions/:id/match", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { kind, documentId } = req.body as { kind?: "invoice" | "bill"; documentId?: string };
  if (kind !== "invoice" && kind !== "bill") { res.status(400).json({ error: "kind must be invoice or bill" }); return; }
  if (!documentId) { res.status(400).json({ error: "documentId required" }); return; }

  const [txn] = await db.select().from(bankTransactions)
    .where(and(eq(bankTransactions.id, req.params.id), eq(bankTransactions.organizationId, orgId)));
  if (!txn) { res.status(404).json({ error: "Not found" }); return; }
  if (txn.status === "CATEGORIZED") { res.status(409).json({ error: "Already categorized" }); return; }

  const [ba] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, txn.bankAccountId));
  if (!ba) { res.status(404).json({ error: "Bank account not found" }); return; }

  const role = kind === "invoice" ? "AR" : "AP";
  const [systemAccount] = await db.select().from(accounts)
    .where(and(eq(accounts.organizationId, orgId), eq(accounts.systemRole, role)));
  if (!systemAccount) { res.status(400).json({ error: `No ${role} account configured` }); return; }

  const magnitude = Math.abs(txn.amountCents);

  // Load + validate the target document BEFORE posting, so a missing or already-
  // settled document can't leave an orphan journal entry. Guard against applying
  // more than the open balance — e.g. the same exact-amount suggestion accepted on
  // two transactions would otherwise double-credit AR/AP against a paid document.
  const noun = kind === "invoice" ? "invoice" : "bill";
  let currentBalance: number;
  if (kind === "invoice") {
    const [inv] = await db.select().from(invoices)
      .where(and(eq(invoices.id, documentId), eq(invoices.organizationId, orgId)));
    if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }
    currentBalance = inv.balanceCents;
  } else {
    const [bill] = await db.select().from(bills)
      .where(and(eq(bills.id, documentId), eq(bills.organizationId, orgId)));
    if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
    currentBalance = bill.balanceCents;
  }
  if (currentBalance <= 0) { res.status(409).json({ error: `This ${noun} is already paid` }); return; }
  if (magnitude > currentBalance) { res.status(409).json({ error: `Amount exceeds the ${noun}'s open balance` }); return; }

  // Deposit/invoice → Dr bank / Cr AR. Payment/bill → Dr AP / Cr bank.
  const updated = await db.transaction(async (tx) => {
    const je = await postEntry({
      organizationId: orgId,
      date: txn.date,
      memo: txn.descriptionRaw,
      sourceType: "BANK",
      sourceId: txn.id,
      lines: kind === "invoice" ? [
        { accountId: ba.accountId, debitCents: magnitude, creditCents: 0 },
        { accountId: systemAccount.id, debitCents: 0, creditCents: magnitude },
      ] : [
        { accountId: systemAccount.id, debitCents: magnitude, creditCents: 0 },
        { accountId: ba.accountId, debitCents: 0, creditCents: magnitude },
      ],
    }, tx);

    const newBalance = currentBalance - magnitude; // magnitude ≤ currentBalance guaranteed above
    if (kind === "invoice") {
      await tx.update(invoices).set({
        balanceCents: newBalance,
        status: newBalance <= 0 ? "PAID" : "PARTIAL",
      }).where(eq(invoices.id, documentId));
    } else {
      await tx.update(bills).set({
        balanceCents: newBalance,
        status: newBalance <= 0 ? "PAID" : "PARTIAL",
      }).where(eq(bills.id, documentId));
    }

    const [row] = await tx.update(bankTransactions).set({
      status: "CATEGORIZED",
      matchType: "MATCHED",
      journalEntryId: je.id,
      matchedInvoiceId: kind === "invoice" ? documentId : null,
      matchedBillId: kind === "bill" ? documentId : null,
    }).where(eq(bankTransactions.id, req.params.id)).returning();
    return row;
  });

  res.json(serializeTxn(updated));
});

// ── CSV import wizard: analyze (duplicates + match suggestions) ──────────────

interface MatchCandidate { id: string; number: string; balanceCents: number; date: Date; name: string | null; }

function bestMatch(date: Date, magnitudeCents: number, description: string, candidates: MatchCandidate[], kind: "invoice" | "bill") {
  let best: { kind: string; id: string; number: string; label: string; confidence: number } | null = null;
  const desc = (description || "").toLowerCase();
  for (const c of candidates) {
    if (c.balanceCents !== magnitudeCents) continue; // exact-amount suggestions only
    // Weighted so a name-token hit is required to reach the 0.8 auto-accept line:
    // amount + date proximity alone caps at 0.7, preventing a same-amount invoice
    // from auto-matching to the wrong party on date alone.
    let conf = 0.5;
    const days = Math.abs((date.getTime() - new Date(c.date).getTime()) / 86_400_000);
    if (days <= 7) conf += 0.2; else if (days <= 30) conf += 0.1;
    const firstWord = c.name ? c.name.toLowerCase().split(/\s+/)[0] : "";
    if (firstWord && desc.includes(firstWord)) conf += 0.3;
    conf = Math.min(conf, 0.99);
    if (!best || conf > best.confidence) {
      best = { kind, id: c.id, number: c.number, label: c.name ? `${c.number} · ${c.name}` : c.number, confidence: Math.round(conf * 100) / 100 };
    }
  }
  return best;
}

router.post("/bank-accounts/:id/import/analyze", async (req, res) => {
  const orgId = req.session.organizationId!;
  const bankAccountId = req.params.id;
  const [ba] = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.organizationId, orgId)));
  if (!ba) { res.status(404).json({ error: "Not found" }); return; }

  const incoming = (req.body?.transactions ?? []) as Array<{ date: string; amountCents: number; description: string }>;

  // Duplicate detection: Date + Amount + Description against existing transactions.
  const existing = await db.select().from(bankTransactions)
    .where(and(eq(bankTransactions.organizationId, orgId), eq(bankTransactions.bankAccountId, bankAccountId)));
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const existKeys = new Map<string, string>();
  for (const e of existing) existKeys.set(`${dayKey(e.date)}|${e.amountCents}|${(e.descriptionRaw || "").trim().toLowerCase()}`, e.id);

  const openInvoices = await db.select({ inv: invoices, name: customers.name })
    .from(invoices).leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(and(eq(invoices.organizationId, orgId), inArray(invoices.status, ["SENT", "PARTIAL", "OVERDUE"])));
  const openBills = await db.select({ bill: bills, name: vendors.name })
    .from(bills).leftJoin(vendors, eq(bills.vendorId, vendors.id))
    .where(and(eq(bills.organizationId, orgId), inArray(bills.status, ["OPEN", "PARTIAL", "OVERDUE"])));

  const invCands: MatchCandidate[] = openInvoices.map(x => ({ id: x.inv.id, number: x.inv.number, balanceCents: x.inv.balanceCents, date: x.inv.dueDate, name: x.name }));
  const billCands: MatchCandidate[] = openBills.map(x => ({ id: x.bill.id, number: x.bill.number, balanceCents: x.bill.balanceCents, date: x.bill.dueDate, name: x.name }));

  const results = incoming.map((t, index) => {
    const d = new Date(t.date);
    const key = `${dayKey(d)}|${t.amountCents}|${(t.description || "").trim().toLowerCase()}`;
    const duplicateOfId = existKeys.get(key) ?? null;
    let match = null;
    if (t.amountCents > 0) match = bestMatch(d, t.amountCents, t.description, invCands, "invoice");
    else if (t.amountCents < 0) match = bestMatch(d, Math.abs(t.amountCents), t.description, billCands, "bill");
    return { index, isDuplicate: !!duplicateOfId, duplicateOfId, match };
  });

  res.json({ results, duplicateCount: results.filter(r => r.isDuplicate).length, matchCount: results.filter(r => r.match).length });
});

// ── CSV import wizard: commit (bulk insert FOR_REVIEW with metadata) ─────────

router.post("/bank-accounts/:id/import/commit", async (req, res) => {
  const orgId = req.session.organizationId!;
  const bankAccountId = req.params.id;
  const [ba] = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.organizationId, orgId)));
  if (!ba) { res.status(404).json({ error: "Not found" }); return; }

  const { fileName, skipDuplicates, transactions } = req.body as {
    fileName?: string; skipDuplicates?: boolean;
    transactions?: Array<{ date: string; amountCents: number; description: string; referenceNumber?: string; payeeName?: string; memo?: string; matchedInvoiceId?: string; matchedBillId?: string; isDuplicate?: boolean }>;
  };
  if (!transactions?.length) { res.status(400).json({ error: "No transactions to import" }); return; }

  const batchId = crypto.randomUUID();
  const importedByName = req.session.name || req.session.email || null;
  let imported = 0, skipped = 0;
  const failures: Array<{ index: number; reason: string }> = [];
  const created: ReturnType<typeof serializeTxn>[] = [];

  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    if (skipDuplicates && t.isDuplicate) { skipped++; continue; }
    const d = new Date(t.date);
    if (isNaN(d.getTime())) { failures.push({ index: i, reason: "Invalid date" }); continue; }
    if (typeof t.amountCents !== "number" || isNaN(t.amountCents)) { failures.push({ index: i, reason: "Invalid amount" }); continue; }
    if (!t.description) { failures.push({ index: i, reason: "Missing description" }); continue; }
    try {
      const [row] = await db.insert(bankTransactions).values({
        organizationId: orgId, bankAccountId, date: d,
        descriptionRaw: String(t.description), amountCents: Math.round(t.amountCents),
        status: "FOR_REVIEW",
        referenceNumber: t.referenceNumber || null,
        payeeName: t.payeeName || null,
        memo: t.memo || null,
        matchedInvoiceId: t.matchedInvoiceId || null,
        matchedBillId: t.matchedBillId || null,
        importBatchId: batchId, importFileName: fileName || null, importedByName,
      }).returning();
      created.push(serializeTxn(row));
      imported++;
    } catch (e: any) {
      failures.push({ index: i, reason: e?.message || "Insert failed" });
    }
  }

  res.json({ batchId, imported, skipped, failed: failures.length, failures, transactions: created });
});

export default router;
