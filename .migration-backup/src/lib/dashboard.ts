import { prisma } from "@/lib/prisma";
import { profitAndLoss } from "@/lib/reports";

/**
 * Dashboard aggregations. KPI tiles compare a period to its prior equivalent
 * (for trend %); the cash-flow chart buckets bank-account ledger movement by
 * month. Kept separate from reports.ts so report logic stays focused.
 */

export interface RangeKpis {
  key: string;
  label: string;
  incomeCents: number;
  expensesCents: number;
  netCents: number;
  prior: { incomeCents: number; expensesCents: number; netCents: number };
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** The three QBO-style ranges, each with its immediately-preceding prior period. */
function kpiRanges(today: Date) {
  const y = today.getFullYear();
  const m = today.getMonth();

  // Last full calendar month, and the month before it.
  const lastMonthStart = new Date(y, m - 1, 1);
  const lastMonthEnd = new Date(y, m, 0);
  const prevMonthStart = new Date(y, m - 2, 1);
  const prevMonthEnd = new Date(y, m - 1, 0);

  // Last 30 days, and the 30 before that.
  const t = startOfDay(today);
  const last30Start = new Date(t);
  last30Start.setDate(last30Start.getDate() - 30);
  const prev30Start = new Date(t);
  prev30Start.setDate(prev30Start.getDate() - 60);
  const prev30End = new Date(last30Start);

  // Year to date, vs the same span last year.
  const ytdStart = new Date(y, 0, 1);
  const priorYtdStart = new Date(y - 1, 0, 1);
  const priorYtdEnd = new Date(y - 1, m, today.getDate());

  return [
    {
      key: "LAST_MONTH",
      label: "Last month",
      cur: { start: lastMonthStart, end: lastMonthEnd },
      prior: { start: prevMonthStart, end: prevMonthEnd },
    },
    {
      key: "LAST_30",
      label: "Last 30 days",
      cur: { start: last30Start, end: t },
      prior: { start: prev30Start, end: prev30End },
    },
    {
      key: "YTD",
      label: "Year to date",
      cur: { start: ytdStart, end: t },
      prior: { start: priorYtdStart, end: priorYtdEnd },
    },
  ];
}

export async function kpiForRanges(
  organizationId: string,
  today: Date = new Date()
): Promise<RangeKpis[]> {
  const ranges = kpiRanges(today);
  return Promise.all(
    ranges.map(async (r) => {
      const [cur, prior] = await Promise.all([
        profitAndLoss(organizationId, r.cur),
        profitAndLoss(organizationId, r.prior),
      ]);
      return {
        key: r.key,
        label: r.label,
        incomeCents: cur.income.totalCents,
        expensesCents: cur.expenses.totalCents,
        netCents: cur.netIncomeCents,
        prior: {
          incomeCents: prior.income.totalCents,
          expensesCents: prior.expenses.totalCents,
          netCents: prior.netIncomeCents,
        },
      };
    })
  );
}

export interface CashFlowPoint {
  month: string; // e.g. "Feb"
  inflowCents: number;
  outflowCents: number;
  netCents: number;
}

/** Monthly cash in/out across the org's bank GL accounts for the last N months. */
export async function cashFlowSeries(
  organizationId: string,
  months = 6,
  today: Date = new Date()
): Promise<CashFlowPoint[]> {
  const bankAccounts = await prisma.account.findMany({
    where: { organizationId, type: "ASSET", subtype: "Bank" },
    select: { id: true },
  });
  const bankIds = bankAccounts.map((a) => a.id);

  // Build empty monthly buckets (oldest -> newest).
  const buckets: { key: string; point: CashFlowPoint }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    buckets.push({
      key,
      point: {
        month: d.toLocaleString("en-US", { month: "short" }),
        inflowCents: 0,
        outflowCents: 0,
        netCents: 0,
      },
    });
  }
  if (bankIds.length === 0) return buckets.map((b) => b.point);

  const windowStart = new Date(today.getFullYear(), today.getMonth() - (months - 1), 1);
  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: { in: bankIds },
      journalEntry: { organizationId, date: { gte: windowStart } },
    },
    select: { debitCents: true, creditCents: true, journalEntry: { select: { date: true } } },
  });

  const byKey = new Map(buckets.map((b) => [b.key, b.point]));
  for (const l of lines) {
    const dt = l.journalEntry.date;
    const key = `${dt.getFullYear()}-${dt.getMonth()}`;
    const point = byKey.get(key);
    if (!point) continue;
    point.inflowCents += l.debitCents;
    point.outflowCents += l.creditCents;
    point.netCents += l.debitCents - l.creditCents;
  }
  return buckets.map((b) => b.point);
}
