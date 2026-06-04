import type { BankTxnStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Banking helpers. Book balances always come from the ledger; the bank balance
 * is the imported feed figure on BankAccount. Matching suggests existing ledger
 * entries whose cash movement equals an unreviewed bank line.
 */

/** Book (ledger) balance of a GL account = net debit (assets are debit-normal). */
export async function bookBalanceCents(
  organizationId: string,
  glAccountId: string,
  asOf?: Date
): Promise<number> {
  const agg = await prisma.journalLine.aggregate({
    where: {
      accountId: glAccountId,
      journalEntry: {
        organizationId,
        ...(asOf ? { date: { lte: asOf } } : {}),
      },
    },
    _sum: { debitCents: true, creditCents: true },
  });
  return (agg._sum.debitCents ?? 0) - (agg._sum.creditCents ?? 0);
}

export interface MatchCandidate {
  journalEntryId: string;
  date: Date;
  memo: string | null;
  sourceType: string;
  amountCents: number;
}

/**
 * Existing journal entries whose movement on the bank's GL account equals the
 * bank line's magnitude and sign, within ±windowDays, not already matched to a
 * bank transaction. Powers the "Match" panel.
 */
export async function findMatchCandidates(
  organizationId: string,
  glAccountId: string,
  txn: { date: Date; amountCents: number },
  windowDays = 5
): Promise<MatchCandidate[]> {
  const magnitude = Math.abs(txn.amountCents);
  const moneyIn = txn.amountCents > 0;
  const from = new Date(txn.date);
  from.setDate(from.getDate() - windowDays);
  const to = new Date(txn.date);
  to.setDate(to.getDate() + windowDays);

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: glAccountId,
      ...(moneyIn ? { debitCents: magnitude } : { creditCents: magnitude }),
      journalEntry: {
        organizationId,
        isReversal: false,
        date: { gte: from, lte: to },
        bankTxns: { none: {} }, // not already matched/added to a bank txn
      },
    },
    include: { journalEntry: true },
    take: 10,
  });

  return lines.map((l) => ({
    journalEntryId: l.journalEntryId,
    date: l.journalEntry.date,
    memo: l.journalEntry.memo,
    sourceType: l.journalEntry.sourceType,
    amountCents: magnitude,
  }));
}

export interface ReviewCounts {
  FOR_REVIEW: number;
  CATEGORIZED: number;
  EXCLUDED: number;
}

/** Transaction counts per status for the register tab badges. */
export async function reviewCounts(
  organizationId: string,
  bankAccountId: string
): Promise<ReviewCounts> {
  const grouped = await prisma.bankTransaction.groupBy({
    by: ["status"],
    where: { organizationId, bankAccountId },
    _count: true,
  });
  const counts: ReviewCounts = { FOR_REVIEW: 0, CATEGORIZED: 0, EXCLUDED: 0 };
  for (const g of grouped) counts[g.status as BankTxnStatus] = g._count;
  return counts;
}
