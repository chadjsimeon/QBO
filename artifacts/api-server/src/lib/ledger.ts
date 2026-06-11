import { db, journalEntries, journalLines, accounts, type DbOrTx } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

export interface PostLine {
  accountId: string;
  debitCents: number;
  creditCents: number;
}

export interface PostEntryInput {
  organizationId: string;
  date: Date;
  memo?: string;
  sourceType: "INVOICE" | "BILL" | "PAYMENT" | "MANUAL" | "ADJUSTMENT" | "BANK" | "EXPENSE" | "SALES_RECEIPT" | "REFUND_RECEIPT" | "CREDIT_NOTE" | "VENDOR_CREDIT" | "CC_CREDIT" | "TRANSFER";
  sourceId?: string;
  lines: PostLine[];
  isReversal?: boolean;
  reversedEntryId?: string;
}

function validateLines(lines: PostLine[]) {
  if (lines.length < 2) throw new Error("Entry needs >= 2 lines");
  const debits = lines.reduce((s, l) => s + l.debitCents, 0);
  const credits = lines.reduce((s, l) => s + l.creditCents, 0);
  if (debits !== credits) throw new Error(`Unbalanced: debits=${debits} credits=${credits}`);
}

// When called without an executor, the header + lines insert runs in its own
// transaction so a mid-write failure can't orphan a journal entry. Callers that
// already hold a transaction pass it in and own commit/rollback.
export async function postEntry(input: PostEntryInput, executor?: DbOrTx) {
  const lines = input.lines.filter(l => l.debitCents !== 0 || l.creditCents !== 0);
  validateLines(lines);

  const write = async (tx: DbOrTx) => {
    const [entry] = await tx.insert(journalEntries).values({
      organizationId: input.organizationId,
      date: input.date,
      memo: input.memo,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      isReversal: input.isReversal ?? false,
      reversedEntryId: input.reversedEntryId,
    }).returning();

    await tx.insert(journalLines).values(lines.map(l => ({
      journalEntryId: entry.id,
      accountId: l.accountId,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
    })));

    return entry;
  };

  return executor ? write(executor) : db.transaction(write);
}

export async function findSystemAccount(organizationId: string, role: string, executor: DbOrTx = db) {
  const results = await executor.select().from(accounts).where(
    and(
      eq(accounts.organizationId, organizationId),
      // @ts-ignore
      eq(accounts.systemRole, role)
    )
  );
  if (!results[0]) throw new Error(`System account not found: ${role}`);
  return results[0];
}

// Opening Balance Equity is the conventional offset account for opening balances
// brought in via a trial balance import. Find it by name, or create it.
export async function findOrCreateOpeningBalanceEquity(organizationId: string, executor: DbOrTx = db) {
  const existing = await executor.select().from(accounts).where(
    and(eq(accounts.organizationId, organizationId), eq(accounts.name, "Opening Balance Equity"))
  );
  if (existing[0]) return existing[0];

  // Pick a non-colliding code in the equity (3xxx) range.
  const equityAccts = await executor.select().from(accounts).where(
    and(eq(accounts.organizationId, organizationId), eq(accounts.type, "EQUITY"))
  );
  const used = new Set(equityAccts.map(a => a.code));
  let code = "3900";
  for (let i = 3900; i <= 3999 && used.has(code); i++) code = String(i);

  const [created] = await executor.insert(accounts).values({
    organizationId,
    code,
    name: "Opening Balance Equity",
    type: "EQUITY",
    subtype: "equity",
    cashFlowCategory: "NONE",
    sortOrder: 390,
  }).returning();
  return created;
}

export async function getNetDebitByAccount(
  organizationId: string,
  dateFilter: { gte?: Date; lte?: Date; lt?: Date } = {}
): Promise<Map<string, number>> {
  const { gte, lte, lt } = dateFilter;

  // Build parameterized query to avoid SQL injection
  let query = sql`
    SELECT jl.account_id, SUM(jl.debit_cents) - SUM(jl.credit_cents) AS net
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.organization_id = ${organizationId}
  `;
  if (gte) query = sql`${query} AND je.date >= ${gte}`;
  if (lte) query = sql`${query} AND je.date <= ${lte}`;
  if (lt) query = sql`${query} AND je.date < ${lt}`;
  query = sql`${query} GROUP BY jl.account_id`;

  const rows = await db.execute<{ account_id: string; net: string }>(query);

  const map = new Map<string, number>();
  for (const row of rows.rows) {
    map.set(row.account_id, Number(row.net));
  }
  return map;
}
