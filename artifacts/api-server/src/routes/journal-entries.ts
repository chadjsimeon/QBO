import { Router } from "express";
import { db, journalEntries, journalLines, accounts } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { postEntry } from "../lib/ledger";

const router = Router();
router.use(requireAuth);

// List user-created (MANUAL) journal entries, newest first, with totals.
router.get("/journal-entries", async (req, res) => {
  const orgId = req.session.organizationId!;
  const entries = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.organizationId, orgId), eq(journalEntries.sourceType, "MANUAL")))
    .orderBy(desc(journalEntries.date));

  const ids = entries.map((e) => e.id);
  const lines = ids.length
    ? await db.select().from(journalLines).where(inArray(journalLines.journalEntryId, ids))
    : [];
  const totals = new Map<string, number>();
  for (const l of lines)
    totals.set(l.journalEntryId, (totals.get(l.journalEntryId) ?? 0) + l.debitCents);

  res.json(
    entries.map((e) => ({
      ...e,
      date: e.date.toISOString(),
      createdAt: e.createdAt.toISOString(),
      totalCents: totals.get(e.id) ?? 0,
    })),
  );
});

router.get("/journal-entries/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, req.params.id), eq(journalEntries.organizationId, orgId)));
  if (!entry) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const rows = await db
    .select({ line: journalLines, code: accounts.code, name: accounts.name })
    .from(journalLines)
    .leftJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(eq(journalLines.journalEntryId, entry.id));

  res.json({
    ...entry,
    date: entry.date.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    lines: rows.map((r) => ({ ...r.line, accountCode: r.code, accountName: r.name })),
  });
});

// Create a manual journal entry. Each line carries exactly one of debit/credit.
router.post("/journal-entries", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { date, memo, lines } = req.body as {
    date?: string;
    memo?: string;
    lines?: Array<{ accountId: string; debitCents?: number; creditCents?: number }>;
  };
  if (!date || !lines || lines.length < 2) {
    res.status(400).json({ error: "A journal entry needs a date and at least 2 lines." });
    return;
  }

  const norm = lines
    .map((l) => ({
      accountId: l.accountId,
      debitCents: Math.round(Number(l.debitCents) || 0),
      creditCents: Math.round(Number(l.creditCents) || 0),
    }))
    .filter((l) => l.accountId && (l.debitCents !== 0 || l.creditCents !== 0));

  if (norm.some((l) => l.debitCents !== 0 && l.creditCents !== 0)) {
    res.status(400).json({ error: "Each line may have a debit OR a credit, not both." });
    return;
  }
  if (norm.some((l) => l.debitCents < 0 || l.creditCents < 0)) {
    res.status(400).json({ error: "Amounts must be non-negative." });
    return;
  }
  if (norm.length < 2) {
    res.status(400).json({ error: "Need at least 2 non-empty lines." });
    return;
  }

  // Ensure all accounts belong to this org.
  const acctIds = [...new Set(norm.map((l) => l.accountId))];
  const owned = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.organizationId, orgId), inArray(accounts.id, acctIds)));
  if (owned.length !== acctIds.length) {
    res.status(400).json({ error: "Unknown account on a line." });
    return;
  }

  try {
    const entry = await postEntry({
      organizationId: orgId,
      date: new Date(date),
      memo: memo || "Journal entry",
      sourceType: "MANUAL",
      lines: norm,
    });
    res
      .status(201)
      .json({ ...entry, date: entry.date.toISOString(), createdAt: entry.createdAt.toISOString() });
  } catch (e: any) {
    res.status(400).json({ error: e.message ?? "Could not post entry" });
  }
});

export default router;
