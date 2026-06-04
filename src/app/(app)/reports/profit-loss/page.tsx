import { requireOrg } from "@/lib/tenant";
import { profitAndLoss } from "@/lib/reports";
import { resolvePeriod, parsePreset } from "@/lib/report-periods";
import { formatCents } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { ReportHeader } from "@/components/report-header";
import { ReportSectionTable } from "@/components/report-section-table";
import { PeriodSelector } from "@/components/period-selector";

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; nonzero?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireOrg();
  const nonZero = sp.nonzero === "1";
  const period = resolvePeriod(parsePreset(sp.preset));
  const pl = await profitAndLoss(
    ctx.organizationId,
    { start: period.start, end: period.end },
    { nonZero }
  );

  return (
    <>
      <PeriodSelector
        basePath="/reports/profit-loss"
        active={period.preset}
        extraParams={nonZero ? { nonzero: "1" } : {}}
      />
      <Card>
        <CardContent className="pt-6">
          <ReportHeader
            title={nonZero ? "Profit & Loss — Non-Zero" : "Profit & Loss"}
            organizationName={ctx.organizationName}
            periodLabel={period.label}
          />

          <ReportSectionTable title="Income" section={pl.income} totalLabel="Total Income" />
          <ReportSectionTable title="Expenses" section={pl.expenses} totalLabel="Total Expenses" />

          <div className="mt-2 flex items-center justify-between border-t-4 border-double border-foreground py-2 text-base font-bold">
            <span>Net Income</span>
            <span className="tabular-nums">{formatCents(pl.netIncomeCents)}</span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
