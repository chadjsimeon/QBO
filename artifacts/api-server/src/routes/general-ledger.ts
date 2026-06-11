import { Router } from "express";
import {
  db,
  accounts,
  journalEntries,
  journalLines,
  bankAccounts,
  reconciliations,
} from "@workspace/db";
import { eq, and, gte, lte, ilike, asc, desc } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { getNetDebitByAccount } from "../lib/ledger";

const router = Router();
router.use(requireAuth);

const NORMAL_DEBIT = new Set(["ASSET", "EXPENSE"]);
// Convert a net-debit figure into the account's normal-balance orientation
// (positive = the account's natural side).
function normalBalance(type: string, netDebit: number) {
  return NORMAL_DEBIT.has(type) ? netDebit : -netDebit;
}

interface LineRow {
  accountId: string;
  debitCents: number;
  creditCents: number;
  entryId: string;
  date: Date;
  memo: string | null;
  sourceType: string;
  sourceId: string | null;
}

// Shared loader: pull every journal line matching the filters, newest-account
// metadata, and the opening (pre-start) net-debit per account.
async function loadLedger(
  orgId: string,
  opts: {
    accountId?: string;
    start?: Date;
    end?: Date;
    sourceType?: string;
    q?: string;
  },
) {
  const conds = [eq(journalEntries.organizationId, orgId)];
  if (opts.accountId) conds.push(eq(journalLines.accountId, opts.accountId));
  if (opts.start) conds.push(gte(journalEntries.date, opts.start));
  if (opts.end) conds.push(lte(journalEntries.date, opts.end));
  if (opts.sourceType) conds.push(eq(journalEntries.sourceType, opts.sourceType as any));
  if (opts.q) conds.push(ilike(journalEntries.memo, `%${opts.q}%`));

  const lines = await db
    .select({
      accountId: journalLines.accountId,
      debitCents: journalLines.debitCents,
      creditCents: journalLines.creditCents,
      entryId: journalEntries.id,
      date: journalEntries.date,
      memo: journalEntries.memo,
      sourceType: journalEntries.sourceType,
      sourceId: journalEntries.sourceId,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .where(and(...conds))
    .orderBy(asc(journalEntries.date), asc(journalEntries.createdAt));

  const opening = opts.start
    ? await getNetDebitByAccount(orgId, { lt: opts.start })
    : new Map<string, number>();

  return { lines: lines as LineRow[], opening };
}

function groupByAccount(lines: LineRow[], opening: Map<string, number>, acctMap: Map<string, any>) {
  const byAccount = new Map<string, LineRow[]>();
  for (const l of lines) {
    if (!byAccount.has(l.accountId)) byAccount.set(l.accountId, []);
    byAccount.get(l.accountId)!.push(l);
  }

  const groups = [];
  for (const [accountId, accLines] of byAccount) {
    const acct = acctMap.get(accountId);
    if (!acct) continue;
    const openingCents = normalBalance(acct.type, opening.get(accountId) ?? 0);
    let running = openingCents;
    let debitTotal = 0,
      creditTotal = 0;
    const outLines = accLines.map((l) => {
      running += normalBalance(acct.type, l.debitCents - l.creditCents);
      debitTotal += l.debitCents;
      creditTotal += l.creditCents;
      return {
        entryId: l.entryId,
        date: l.date.toISOString(),
        sourceType: l.sourceType,
        sourceId: l.sourceId,
        memo: l.memo,
        debitCents: l.debitCents,
        creditCents: l.creditCents,
        runningBalanceCents: running,
      };
    });
    groups.push({
      account: {
        id: acct.id,
        code: acct.code,
        name: acct.name,
        type: acct.type,
        subtype: acct.subtype,
        isActive: acct.isActive,
      },
      openingCents,
      debitTotalCents: debitTotal,
      creditTotalCents: creditTotal,
      closingCents: running,
      lines: outLines,
    });
  }
  groups.sort((a, b) => a.account.code.localeCompare(b.account.code));
  return groups;
}

function parseFilters(q: Record<string, string>) {
  return {
    accountId: q.accountId || undefined,
    start: q.start ? new Date(q.start) : undefined,
    end: q.end ? new Date(q.end + "T23:59:59.999Z") : undefined,
    sourceType: q.sourceType || undefined,
    q: q.q?.trim() || undefined,
  };
}

// Full general ledger, grouped by account, with running balances.
router.get("/general-ledger", async (req, res) => {
  const orgId = req.session.organizationId!;
  const filters = parseFilters(req.query as Record<string, string>);
  const [{ lines, opening }, accts] = await Promise.all([
    loadLedger(orgId, filters),
    db.select().from(accounts).where(eq(accounts.organizationId, orgId)),
  ]);
  const acctMap = new Map(accts.map((a) => [a.id, a]));
  res.json({ accounts: groupByAccount(lines, opening, acctMap) });
});

// Multi-account summary: opening / debit total / credit total / closing per account.
router.get("/general-ledger/summary", async (req, res) => {
  const orgId = req.session.organizationId!;
  const q = req.query as Record<string, string>;
  const start = q.start ? new Date(q.start) : undefined;
  const end = q.end ? new Date(q.end + "T23:59:59.999Z") : undefined;
  const typeFilter = q.type || undefined;

  const [accts, opening, closing, periodLines] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.organizationId, orgId)),
    start ? getNetDebitByAccount(orgId, { lt: start }) : Promise.resolve(new Map<string, number>()),
    getNetDebitByAccount(orgId, end ? { lte: end } : {}),
    loadLedger(orgId, { start, end }),
  ]);

  // Debit/credit movement totals within the period, per account.
  const movement = new Map<string, { d: number; c: number }>();
  for (const l of periodLines.lines) {
    const m = movement.get(l.accountId) ?? { d: 0, c: 0 };
    m.d += l.debitCents;
    m.c += l.creditCents;
    movement.set(l.accountId, m);
  }

  const rows = accts
    .filter((a) => !typeFilter || a.type === typeFilter)
    .map((a) => {
      const m = movement.get(a.id) ?? { d: 0, c: 0 };
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        isActive: a.isActive,
        openingCents: normalBalance(a.type, opening.get(a.id) ?? 0),
        debitTotalCents: m.d,
        creditTotalCents: m.c,
        closingCents: normalBalance(a.type, closing.get(a.id) ?? 0),
      };
    })
    .sort((x, y) => x.code.localeCompare(y.code));

  res.json({ rows });
});

// Single account ledger + reconciliation status.
router.get("/general-ledger/accounts/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const q = req.query as Record<string, string>;
  const start = q.start ? new Date(q.start) : undefined;
  const end = q.end ? new Date(q.end + "T23:59:59.999Z") : undefined;

  const [acct] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, req.params.id), eq(accounts.organizationId, orgId)));
  if (!acct) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const { lines, opening } = await loadLedger(orgId, { accountId: req.params.id, start, end });
  const acctMap = new Map([[acct.id, acct]]);
  const [group] = groupByAccount(lines, opening, acctMap);

  // Reconciliation status: is this GL account linked to a bank account, and what
  // was the most recent reconciliation?
  const [bank] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.accountId, acct.id), eq(bankAccounts.organizationId, orgId)));
  let reconciliation: { status: string; statementDate: string; bankAccountId: string } | null =
    null;
  if (bank) {
    const [rec] = await db
      .select()
      .from(reconciliations)
      .where(
        and(eq(reconciliations.bankAccountId, bank.id), eq(reconciliations.organizationId, orgId)),
      )
      .orderBy(desc(reconciliations.statementDate))
      .limit(1);
    reconciliation = {
      status: rec ? rec.status : "NONE",
      statementDate: rec ? rec.statementDate.toISOString() : "",
      bankAccountId: bank.id,
    };
  }

  res.json({
    account: {
      id: acct.id,
      code: acct.code,
      name: acct.name,
      type: acct.type,
      subtype: acct.subtype,
      isActive: acct.isActive,
      description: acct.description,
    },
    ledger: group ?? {
      account: acct,
      openingCents: normalBalance(acct.type, opening.get(acct.id) ?? 0),
      debitTotalCents: 0,
      creditTotalCents: 0,
      closingCents: normalBalance(acct.type, opening.get(acct.id) ?? 0),
      lines: [],
    },
    reconciliation,
  });
});

export default router;
