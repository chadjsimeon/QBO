import { Prisma, PrismaClient, type SystemRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sumCents } from "@/lib/money";

/**
 * The ledger engine — the single source of truth for the books.
 *
 * No feature code writes to JournalEntry/JournalLine directly; everything goes
 * through `postEntry` (or the document-specific helpers below). The module
 * enforces the double-entry invariants:
 *   - every entry has >= 2 lines and sum(debit) == sum(credit)
 *   - every line has exactly one of debit/credit non-zero (and non-negative)
 * Posting is append-only: corrections happen via `reverseEntry`, never edits.
 *
 * Callers pass a Prisma transaction client (`tx`) so the journal entry, its
 * lines, and the originating document's status update all commit atomically.
 */

export type Tx = Prisma.TransactionClient | PrismaClient;

export interface PostLine {
  accountId: string;
  debitCents: number;
  creditCents: number;
}

export interface PostEntryInput {
  organizationId: string;
  date: Date;
  memo?: string;
  sourceType: Prisma.JournalEntryCreateInput["sourceType"];
  sourceId?: string;
  lines: PostLine[];
  isReversal?: boolean;
  reversedEntryId?: string;
}

/** Validate a set of lines against the double-entry invariants. Throws on failure. */
export function validateLines(lines: PostLine[]): void {
  if (lines.length < 2) {
    throw new Error("A journal entry must have at least 2 lines.");
  }
  for (const line of lines) {
    if (line.debitCents < 0 || line.creditCents < 0) {
      throw new Error("Journal line amounts must be non-negative.");
    }
    const debitSet = line.debitCents > 0;
    const creditSet = line.creditCents > 0;
    if (debitSet === creditSet) {
      throw new Error(
        "Each journal line must have exactly one of debit/credit non-zero."
      );
    }
  }
  const debits = sumCents(lines.map((l) => l.debitCents));
  const credits = sumCents(lines.map((l) => l.creditCents));
  if (debits !== credits) {
    throw new Error(
      `Journal entry is unbalanced: debits=${debits} credits=${credits}.`
    );
  }
}

/** Core posting primitive. Creates a balanced JournalEntry with its lines. */
export async function postEntry(tx: Tx, input: PostEntryInput) {
  // Drop zero lines defensively, then validate.
  const lines = input.lines.filter(
    (l) => l.debitCents !== 0 || l.creditCents !== 0
  );
  validateLines(lines);

  return tx.journalEntry.create({
    data: {
      organizationId: input.organizationId,
      date: input.date,
      memo: input.memo,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      isReversal: input.isReversal ?? false,
      reversedEntryId: input.reversedEntryId,
      lines: {
        create: lines.map((l) => ({
          accountId: l.accountId,
          debitCents: l.debitCents,
          creditCents: l.creditCents,
        })),
      },
    },
    include: { lines: true },
  });
}

/** Locate a key account by its systemRole (never by code). Throws if missing. */
export async function findSystemAccount(
  tx: Tx,
  organizationId: string,
  role: SystemRole
) {
  const account = await tx.account.findFirst({
    where: { organizationId, systemRole: role },
  });
  if (!account) {
    throw new Error(
      `No account configured with systemRole=${role} for this organization.`
    );
  }
  return account;
}

// ── Document posting helpers ────────────────────────────────────────────────

/**
 * Invoice issued:  Debit A/R (total)  |  Credit Income (per line) + Sales Tax Payable.
 */
export async function postInvoiceIssued(
  tx: Tx,
  params: {
    organizationId: string;
    invoiceId: string;
    date: Date;
    number: string;
    totalCents: number;
    taxCents: number;
    incomeLines: { accountId: string; amountCents: number }[];
  }
) {
  const ar = await findSystemAccount(tx, params.organizationId, "AR");
  const lines: PostLine[] = [
    { accountId: ar.id, debitCents: params.totalCents, creditCents: 0 },
  ];
  for (const line of params.incomeLines) {
    if (line.amountCents === 0) continue;
    lines.push({ accountId: line.accountId, debitCents: 0, creditCents: line.amountCents });
  }
  if (params.taxCents > 0) {
    const tax = await findSystemAccount(tx, params.organizationId, "SALES_TAX_PAYABLE");
    lines.push({ accountId: tax.id, debitCents: 0, creditCents: params.taxCents });
  }
  return postEntry(tx, {
    organizationId: params.organizationId,
    date: params.date,
    memo: `Invoice ${params.number}`,
    sourceType: "INVOICE",
    sourceId: params.invoiceId,
    lines,
  });
}

/**
 * Bill entered:  Debit Expense (per line) + Sales Tax Payable  |  Credit A/P (total).
 */
export async function postBillEntered(
  tx: Tx,
  params: {
    organizationId: string;
    billId: string;
    date: Date;
    number: string;
    totalCents: number;
    taxCents: number;
    expenseLines: { accountId: string; amountCents: number }[];
  }
) {
  const ap = await findSystemAccount(tx, params.organizationId, "AP");
  const lines: PostLine[] = [];
  for (const line of params.expenseLines) {
    if (line.amountCents === 0) continue;
    lines.push({ accountId: line.accountId, debitCents: line.amountCents, creditCents: 0 });
  }
  if (params.taxCents > 0) {
    const tax = await findSystemAccount(tx, params.organizationId, "SALES_TAX_PAYABLE");
    lines.push({ accountId: tax.id, debitCents: params.taxCents, creditCents: 0 });
  }
  lines.push({ accountId: ap.id, debitCents: 0, creditCents: params.totalCents });
  return postEntry(tx, {
    organizationId: params.organizationId,
    date: params.date,
    memo: `Bill ${params.number}`,
    sourceType: "BILL",
    sourceId: params.billId,
    lines,
  });
}

/**
 * Payment received from a customer:  Debit Cash  |  Credit A/R.
 */
export async function postPaymentReceived(
  tx: Tx,
  params: {
    organizationId: string;
    paymentId: string;
    date: Date;
    amountCents: number;
  }
) {
  const cash = await findSystemAccount(tx, params.organizationId, "CASH");
  const ar = await findSystemAccount(tx, params.organizationId, "AR");
  return postEntry(tx, {
    organizationId: params.organizationId,
    date: params.date,
    memo: "Payment received",
    sourceType: "PAYMENT",
    sourceId: params.paymentId,
    lines: [
      { accountId: cash.id, debitCents: params.amountCents, creditCents: 0 },
      { accountId: ar.id, debitCents: 0, creditCents: params.amountCents },
    ],
  });
}

/**
 * Payment sent to a vendor:  Debit A/P  |  Credit Cash.
 */
export async function postPaymentSent(
  tx: Tx,
  params: {
    organizationId: string;
    paymentId: string;
    date: Date;
    amountCents: number;
  }
) {
  const cash = await findSystemAccount(tx, params.organizationId, "CASH");
  const ap = await findSystemAccount(tx, params.organizationId, "AP");
  return postEntry(tx, {
    organizationId: params.organizationId,
    date: params.date,
    memo: "Payment sent",
    sourceType: "PAYMENT",
    sourceId: params.paymentId,
    lines: [
      { accountId: ap.id, debitCents: params.amountCents, creditCents: 0 },
      { accountId: cash.id, debitCents: 0, creditCents: params.amountCents },
    ],
  });
}

/**
 * Categorize/add a bank-feed transaction:
 *   money in  (amountCents > 0): Debit bank GL account | Credit each split account
 *   money out (amountCents < 0): Debit each split account | Credit bank GL account
 *
 * A single-category categorization is just a one-element split. Matching an
 * existing entry does NOT call this — it only links the bank txn to the prior JE.
 */
export async function postBankTransaction(
  tx: Tx,
  params: {
    organizationId: string;
    bankTransactionId: string;
    date: Date;
    bankGlAccountId: string;
    amountCents: number; // signed
    splits: { accountId: string; amountCents: number }[]; // positive magnitudes
    memo?: string;
  }
) {
  const magnitude = Math.abs(params.amountCents);
  const splitTotal = sumCents(params.splits.map((s) => s.amountCents));
  if (params.splits.length === 0) {
    throw new Error("A bank categorization needs at least one split line.");
  }
  if (splitTotal !== magnitude) {
    throw new Error(
      `Split total (${splitTotal}) must equal the transaction amount (${magnitude}).`
    );
  }
  const moneyIn = params.amountCents > 0;
  const lines: PostLine[] = [];
  if (moneyIn) {
    lines.push({ accountId: params.bankGlAccountId, debitCents: magnitude, creditCents: 0 });
    for (const s of params.splits) {
      lines.push({ accountId: s.accountId, debitCents: 0, creditCents: s.amountCents });
    }
  } else {
    for (const s of params.splits) {
      lines.push({ accountId: s.accountId, debitCents: s.amountCents, creditCents: 0 });
    }
    lines.push({ accountId: params.bankGlAccountId, debitCents: 0, creditCents: magnitude });
  }
  return postEntry(tx, {
    organizationId: params.organizationId,
    date: params.date,
    memo: params.memo ?? "Bank transaction",
    sourceType: "BANK",
    sourceId: params.bankTransactionId,
    lines,
  });
}

/**
 * Reverse a prior entry: clone its lines with debit/credit flipped, tagged
 * isReversal. Never edit or delete the original — this is how corrections work.
 */
export async function reverseEntry(
  tx: Tx,
  organizationId: string,
  entryId: string,
  date: Date = new Date(),
  memo?: string
) {
  const original = await tx.journalEntry.findFirst({
    where: { id: entryId, organizationId },
    include: { lines: true },
  });
  if (!original) throw new Error("Entry to reverse not found.");

  const lines: PostLine[] = original.lines.map((l) => ({
    accountId: l.accountId,
    debitCents: l.creditCents,
    creditCents: l.debitCents,
  }));

  return postEntry(tx, {
    organizationId,
    date,
    memo: memo ?? `Reversal of ${original.memo ?? original.id}`,
    sourceType: original.sourceType,
    sourceId: original.sourceId ?? undefined,
    lines,
    isReversal: true,
    reversedEntryId: original.id,
  });
}

// ── Trial balance (health check) ────────────────────────────────────────────

export interface TrialBalanceRow {
  accountId: string;
  debitCents: number;
  creditCents: number;
  netDebitCents: number; // debit - credit (positive = net debit)
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebitCents: number;
  totalCreditCents: number;
  balanced: boolean;
}

/**
 * Net debit/credit per account, summed from the ledger up to `asOf` (inclusive).
 * The grand totals must always match — used as a health check in tests.
 */
export async function trialBalance(
  organizationId: string,
  asOf?: Date,
  client: Tx = prisma
): Promise<TrialBalance> {
  const grouped = await client.journalLine.groupBy({
    by: ["accountId"],
    where: {
      journalEntry: {
        organizationId,
        ...(asOf ? { date: { lte: asOf } } : {}),
      },
    },
    _sum: { debitCents: true, creditCents: true },
  });

  const rows: TrialBalanceRow[] = grouped.map((g) => {
    const debit = g._sum.debitCents ?? 0;
    const credit = g._sum.creditCents ?? 0;
    return {
      accountId: g.accountId,
      debitCents: debit,
      creditCents: credit,
      netDebitCents: debit - credit,
    };
  });

  const totalDebitCents = sumCents(rows.map((r) => r.debitCents));
  const totalCreditCents = sumCents(rows.map((r) => r.creditCents));

  return {
    rows,
    totalDebitCents,
    totalCreditCents,
    balanced: totalDebitCents === totalCreditCents,
  };
}
