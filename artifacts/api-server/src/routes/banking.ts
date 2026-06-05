import { Router } from "express";
import { db, bankAccounts, bankTransactions, accounts, invoices, bills, customers, vendors } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
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

// ── CSV import wizard: analyze (duplicates + match suggestions) ──────────────

interface MatchCandidate { id: string; number: string; balanceCents: number; date: Date; name: string | null; }

function bestMatch(date: Date, magnitudeCents: number, description: string, candidates: MatchCandidate[], kind: "invoice" | "bill") {
  let best: { kind: string; id: string; number: string; label: string; confidence: number } | null = null;
  const desc = (description || "").toLowerCase();
  for (const c of candidates) {
    if (c.balanceCents !== magnitudeCents) continue; // exact-amount suggestions only
    let conf = 0.6;
    const days = Math.abs((date.getTime() - new Date(c.date).getTime()) / 86_400_000);
    if (days <= 7) conf += 0.2; else if (days <= 30) conf += 0.1;
    const firstWord = c.name ? c.name.toLowerCase().split(/\s+/)[0] : "";
    if (firstWord && desc.includes(firstWord)) conf += 0.2;
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
