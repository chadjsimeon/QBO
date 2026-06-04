import Link from "next/link";
import { Wallet, FileText, Receipt } from "lucide-react";
import { prisma, requireOrg } from "@/lib/tenant";
import { profitAndLoss } from "@/lib/reports";
import { resolvePeriod } from "@/lib/report-periods";
import { kpiForRanges, cashFlowSeries } from "@/lib/dashboard";
import { bookBalanceCents, reviewCounts } from "@/lib/banking";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { OPEN_INVOICE_STATUSES, OPEN_BILL_STATUSES } from "@/lib/status";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExpenseDonut, type DonutSlice } from "@/components/expense-donut";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { PlBars } from "@/components/dashboard/pl-bars";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { BankAccountsWidget, type BankWidgetItem } from "@/components/dashboard/bank-accounts-widget";

export default async function DashboardPage() {
  const ctx = await requireOrg();
  const orgId = ctx.organizationId;
  const today = new Date();
  const ytd = resolvePeriod("THIS_YEAR_TO_DATE", today);

  const [kpis, cashFlow, pl, bankAccounts, arAgg, apAgg, recentEntries] = await Promise.all([
    kpiForRanges(orgId, today),
    cashFlowSeries(orgId, 6, today),
    profitAndLoss(orgId, { start: ytd.start, end: ytd.end }),
    prisma.bankAccount.findMany({
      where: { organizationId: orgId },
      include: { account: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invoice.aggregate({
      where: { organizationId: orgId, status: { in: OPEN_INVOICE_STATUSES } },
      _sum: { balanceCents: true },
      _count: true,
    }),
    prisma.bill.aggregate({
      where: { organizationId: orgId, status: { in: OPEN_BILL_STATUSES } },
      _sum: { balanceCents: true },
      _count: true,
    }),
    prisma.journalEntry.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { lines: true },
    }),
  ]);

  // Bank widget data + cash on hand (sum of book balances).
  const bankItems: BankWidgetItem[] = await Promise.all(
    bankAccounts.map(async (b) => ({
      id: b.id,
      institutionName: b.institutionName,
      accountMask: b.accountMask,
      accountName: b.account.name,
      bankBalanceCents: b.bankBalanceCents,
      bookBalanceCents: await bookBalanceCents(orgId, b.accountId),
      forReview: (await reviewCounts(orgId, b.id)).FOR_REVIEW,
    }))
  );
  const cashCents = bankItems.reduce((s, b) => s + b.bookBalanceCents, 0);

  const donut: DonutSlice[] = pl.expenses.rows
    .filter((r) => r.depth === 0 && r.amountCents > 0)
    .map((r) => ({ name: r.account.name, valueCents: r.amountCents }))
    .sort((a, b) => b.valueCents - a.valueCents);

  const arOpen = arAgg._sum.balanceCents ?? 0;
  const apOpen = apAgg._sum.balanceCents ?? 0;

  return (
    <>
      <PageHeader title="Dashboard" description={ctx.organizationName} />

      <QuickActions />

      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Business at a glance</h2>
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Cash on hand</span>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{formatCents(cashCents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">Across {bankItems.length} account{bankItems.length === 1 ? "" : "s"}</div>
          </CardContent>
        </Card>
        <KpiTile label="Income" metric="income" data={kpis} goodWhenUp />
        <KpiTile label="Expenses" metric="expenses" data={kpis} goodWhenUp={false} />
        <KpiTile label="Net profit" metric="net" data={kpis} goodWhenUp />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <PlBars
          incomeCents={pl.income.totalCents}
          expensesCents={pl.expenses.totalCents}
          periodLabel={ytd.label}
        />
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Cash flow</CardTitle>
          </CardHeader>
          <CardContent>
            <CashFlowChart data={cashFlow} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <BankAccountsWidget items={bankItems} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expenses by category (YTD)</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseDonut data={donut} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Link href="/invoices">
            <Card className="transition-colors hover:border-foreground/30">
              <CardContent className="flex items-center gap-3 pt-6">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">
                    Outstanding invoices ({arAgg._count})
                  </div>
                  <div className="text-xl font-bold tabular-nums">{formatCents(arOpen)}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/bills">
            <Card className="transition-colors hover:border-foreground/30">
              <CardContent className="flex items-center gap-3 pt-6">
                <Receipt className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">
                    Unpaid bills ({apAgg._count})
                  </div>
                  <div className="text-xl font-bold tabular-nums">{formatCents(apOpen)}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent ledger activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="divide-y">
                {recentEntries.map((e) => {
                  const amount = e.lines.reduce((s, l) => s + l.debitCents, 0);
                  return (
                    <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                      <span>
                        <span className="text-muted-foreground">{formatDate(e.date)}</span>{" "}
                        {e.memo ?? e.sourceType}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{formatCents(amount)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
