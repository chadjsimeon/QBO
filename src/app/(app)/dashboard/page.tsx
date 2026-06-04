import Link from "next/link";
import { Wallet, TrendingUp, TrendingDown, FileText, Receipt } from "lucide-react";
import { prisma, requireOrg } from "@/lib/tenant";
import { profitAndLoss, netDebitByAccount } from "@/lib/reports";
import { resolvePeriod } from "@/lib/report-periods";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { OPEN_INVOICE_STATUSES, OPEN_BILL_STATUSES } from "@/lib/status";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExpenseDonut, type DonutSlice } from "@/components/expense-donut";

export default async function DashboardPage() {
  const ctx = await requireOrg();
  const orgId = ctx.organizationId;
  const today = new Date();
  const period = resolvePeriod("THIS_YEAR_TO_DATE", today);

  const [pl, netToDate, cashAccounts, arAgg, apAgg, recentEntries] = await Promise.all([
    profitAndLoss(orgId, { start: period.start, end: period.end }),
    netDebitByAccount(orgId, { end: today }),
    prisma.account.findMany({
      where: { organizationId: orgId, type: "ASSET", subtype: "Bank" },
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
      take: 8,
      include: { lines: true },
    }),
  ]);

  // Cash = net debit across bank accounts (assets are debit-normal).
  const cashCents = cashAccounts.reduce(
    (sum, a) => sum + (netToDate.get(a.id) ?? 0),
    0
  );

  // Expense breakdown: top-level expense categories with activity.
  const donut: DonutSlice[] = pl.expenses.rows
    .filter((r) => r.depth === 0 && r.amountCents > 0)
    .map((r) => ({ name: r.account.name, valueCents: r.amountCents }))
    .sort((a, b) => b.valueCents - a.valueCents);

  const arOpen = arAgg._sum.balanceCents ?? 0;
  const apOpen = apAgg._sum.balanceCents ?? 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${ctx.organizationName} · year to date`}
      />

      <div className="grid grid-cols-4 gap-4">
        <Stat label="Cash on hand" value={formatCents(cashCents)} icon={Wallet} />
        <Stat label="Income (YTD)" value={formatCents(pl.income.totalCents)} icon={TrendingUp} />
        <Stat label="Expenses (YTD)" value={formatCents(pl.expenses.totalCents)} icon={TrendingDown} />
        <Stat
          label="Net income (YTD)"
          value={formatCents(pl.netIncomeCents)}
          icon={TrendingUp}
          accent={pl.netIncomeCents >= 0 ? "text-green-700" : "text-destructive"}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <Card className="col-span-2">
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

function Stat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className={`mt-1 text-2xl font-bold tabular-nums ${accent ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
