import { db, journalEntries, journalLines, accounts } from "@workspace/db";
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
  sourceType: "INVOICE" | "BILL" | "PAYMENT" | "MANUAL" | "ADJUSTMENT" | "BANK";
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

export async function postEntry(input: PostEntryInput) {
  const lines = input.lines.filter(l => l.debitCents !== 0 || l.creditCents !== 0);
  validateLines(lines);

  const [entry] = await db.insert(journalEntries).values({
    organizationId: input.organizationId,
    date: input.date,
    memo: input.memo,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    isReversal: input.isReversal ?? false,
    reversedEntryId: input.reversedEntryId,
  }).returning();

  await db.insert(journalLines).values(lines.map(l => ({
    journalEntryId: entry.id,
    accountId: l.accountId,
    debitCents: l.debitCents,
    creditCents: l.creditCents,
  })));

  return entry;
}

export async function findSystemAccount(organizationId: string, role: string) {
  const results = await db.select().from(accounts).where(
    and(
      eq(accounts.organizationId, organizationId),
      // @ts-ignore
      eq(accounts.systemRole, role)
    )
  );
  if (!results[0]) throw new Error(`System account not found: ${role}`);
  return results[0];
}

export async function getNetDebitByAccount(
  organizationId: string,
  dateFilter: { gte?: Date; lte?: Date } = {}
): Promise<Map<string, number>> {
  const { gte, lte } = dateFilter;

  // Build parameterized query to avoid SQL injection
  let query = sql`
    SELECT jl.account_id, SUM(jl.debit_cents) - SUM(jl.credit_cents) AS net
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.organization_id = ${organizationId}
  `;
  if (gte) query = sql`${query} AND je.date >= ${gte}`;
  if (lte) query = sql`${query} AND je.date <= ${lte}`;
  query = sql`${query} GROUP BY jl.account_id`;

  const rows = await db.execute<{ account_id: string; net: string }>(query);

  const map = new Map<string, number>();
  for (const row of rows.rows) {
    map.set(row.account_id, Number(row.net));
  }
  return map;
}
