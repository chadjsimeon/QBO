import type { Account, AccountType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildAccountTree, type AccountNode } from "@/lib/accounts";
import { daysBetween } from "@/lib/dates";

/**
 * Reporting engine. Every figure is derived from the ledger (JournalLine), never
 * from document tables, so reports always agree with the books. Accrual basis.
 *
 * Sign convention: we sum net debit (debit - credit) per account, then convert
 * to a "display amount" per account type so each report section reads positive
 * in its natural direction (income/liability/equity are credit-normal).
 */

export interface DateRange {
  start?: Date;
  end?: Date;
}

/** netDebit (debit - credit) per account over the given range. */
export async function netDebitByAccount(
  organizationId: string,
  range: DateRange = {}
): Promise<Map<string, number>> {
  const dateFilter: Record<string, Date> = {};
  if (range.start) dateFilter.gte = range.start;
  if (range.end) dateFilter.lte = range.end;

  const grouped = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: {
      journalEntry: {
        organizationId,
        ...(range.start || range.end ? { date: dateFilter } : {}),
      },
    },
    _sum: { debitCents: true, creditCents: true },
  });

  const map = new Map<string, number>();
  for (const g of grouped) {
    map.set(g.accountId, (g._sum.debitCents ?? 0) - (g._sum.creditCents ?? 0));
  }
  return map;
}

/** Convert an account's net debit to its display amount for reports. */
export function displayAmount(type: AccountType, netDebitCents: number): number {
  switch (type) {
    case "INCOME":
    case "LIABILITY":
    case "EQUITY":
      return -netDebitCents; // credit-normal
    case "ASSET":
    case "EXPENSE":
      return netDebitCents; // debit-normal
  }
}

export interface ReportRow {
  account: Account;
  depth: number;
  amountCents: number; // node total (own + descendants)
  isParent: boolean;
}

interface ComputedNode extends AccountNode {
  ownCents: number;
  totalCents: number;
  computedChildren: ComputedNode[];
}

function compute(node: AccountNode, net: Map<string, number>): ComputedNode {
  const ownCents = displayAmount(node.type, net.get(node.id) ?? 0);
  const computedChildren = node.children.map((c) => compute(c, net));
  const totalCents =
    ownCents + computedChildren.reduce((s, c) => s + c.totalCents, 0);
  return { ...node, ownCents, totalCents, computedChildren };
}

function emit(node: ComputedNode, rows: ReportRow[], nonZero: boolean) {
  if (nonZero && node.totalCents === 0) return;
  const isParent = node.computedChildren.length > 0;
  rows.push({ account: node, depth: node.depth, amountCents: node.totalCents, isParent });
  for (const c of node.computedChildren) emit(c, rows, nonZero);
}

export interface ReportSection {
  type: AccountType;
  rows: ReportRow[];
  totalCents: number;
}

function buildSection(
  type: AccountType,
  tree: AccountNode[],
  net: Map<string, number>,
  nonZero: boolean
): ReportSection {
  const computed = tree.filter((n) => n.type === type).map((n) => compute(n, net));
  const rows: ReportRow[] = [];
  for (const n of computed) emit(n, rows, nonZero);
  const totalCents = computed.reduce((s, n) => s + n.totalCents, 0);
  return { type, rows, totalCents };
}

async function accountTree(organizationId: string) {
  const accounts = await prisma.account.findMany({ where: { organizationId } });
  return buildAccountTree(accounts);
}

// ── Profit & Loss ───────────────────────────────────────────────────────────

export interface ProfitAndLoss {
  income: ReportSection;
  expenses: ReportSection;
  netIncomeCents: number;
  range: DateRange;
}

export async function profitAndLoss(
  organizationId: string,
  range: DateRange,
  opts: { nonZero?: boolean } = {}
): Promise<ProfitAndLoss> {
  const nonZero = opts.nonZero ?? false;
  const [tree, net] = await Promise.all([
    accountTree(organizationId),
    netDebitByAccount(organizationId, range),
  ]);
  const income = buildSection("INCOME", tree, net, nonZero);
  const expenses = buildSection("EXPENSE", tree, net, nonZero);
  return {
    income,
    expenses,
    netIncomeCents: income.totalCents - expenses.totalCents,
    range,
  };
}

// ── Balance Sheet ───────────────────────────────────────────────────────────

export interface BalanceSheet {
  assets: ReportSection;
  liabilities: ReportSection;
  equity: ReportSection;
  netIncomeCents: number;
  totalEquityWithIncomeCents: number;
  liabilitiesPlusEquityCents: number;
  balanced: boolean;
  asOf: Date;
}

export async function balanceSheet(
  organizationId: string,
  asOf: Date,
  opts: { nonZero?: boolean } = {}
): Promise<BalanceSheet> {
  const nonZero = opts.nonZero ?? false;
  const [tree, net] = await Promise.all([
    accountTree(organizationId),
    netDebitByAccount(organizationId, { end: asOf }),
  ]);

  const assets = buildSection("ASSET", tree, net, nonZero);
  const liabilities = buildSection("LIABILITY", tree, net, nonZero);
  const equity = buildSection("EQUITY", tree, net, nonZero);

  // Net income to date rolls into equity so the sheet balances (we don't post
  // closing entries to Retained Earnings in MVP1).
  const income = buildSection("INCOME", tree, net, false);
  const expenses = buildSection("EXPENSE", tree, net, false);
  const netIncomeCents = income.totalCents - expenses.totalCents;

  const totalEquityWithIncomeCents = equity.totalCents + netIncomeCents;
  const liabilitiesPlusEquityCents =
    liabilities.totalCents + totalEquityWithIncomeCents;

  return {
    assets,
    liabilities,
    equity,
    netIncomeCents,
    totalEquityWithIncomeCents,
    liabilitiesPlusEquityCents,
    balanced: assets.totalCents === liabilitiesPlusEquityCents,
    asOf,
  };
}

// ── Aging ───────────────────────────────────────────────────────────────────

export interface AgingRow {
  id: string;
  number: string;
  contactName: string;
  dueDate: Date;
  balanceCents: number;
  bucket: number; // index into AGING_BUCKETS
}

export const AGING_BUCKETS = ["Current", "1–30", "31–60", "61–90", "90+"] as const;

function bucketFor(asOf: Date, dueDate: Date): number {
  const overdue = daysBetween(dueDate, asOf); // positive = past due
  if (overdue <= 0) return 0;
  if (overdue <= 30) return 1;
  if (overdue <= 60) return 2;
  if (overdue <= 90) return 3;
  return 4;
}

export interface AgingReport {
  rows: AgingRow[];
  bucketTotals: number[];
  totalCents: number;
  asOf: Date;
}

export async function arAging(
  organizationId: string,
  asOf: Date
): Promise<AgingReport> {
  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId,
      status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
      balanceCents: { gt: 0 },
    },
    include: { customer: true },
    orderBy: { dueDate: "asc" },
  });
  return aging(
    invoices.map((i) => ({
      id: i.id,
      number: i.number,
      contactName: i.customer.name,
      dueDate: i.dueDate,
      balanceCents: i.balanceCents,
    })),
    asOf
  );
}

export async function apAging(
  organizationId: string,
  asOf: Date
): Promise<AgingReport> {
  const bills = await prisma.bill.findMany({
    where: {
      organizationId,
      status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
      balanceCents: { gt: 0 },
    },
    include: { vendor: true },
    orderBy: { dueDate: "asc" },
  });
  return aging(
    bills.map((b) => ({
      id: b.id,
      number: b.number,
      contactName: b.vendor.name,
      dueDate: b.dueDate,
      balanceCents: b.balanceCents,
    })),
    asOf
  );
}

function aging(
  docs: Omit<AgingRow, "bucket">[],
  asOf: Date
): AgingReport {
  const bucketTotals = [0, 0, 0, 0, 0];
  const rows: AgingRow[] = docs.map((d) => {
    const bucket = bucketFor(asOf, d.dueDate);
    bucketTotals[bucket] += d.balanceCents;
    return { ...d, bucket };
  });
  return {
    rows,
    bucketTotals,
    totalCents: bucketTotals.reduce((s, v) => s + v, 0),
    asOf,
  };
}
