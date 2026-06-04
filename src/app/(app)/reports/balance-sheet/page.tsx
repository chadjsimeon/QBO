import { requireOrg } from "@/lib/tenant";
import { balanceSheet } from "@/lib/reports";
import { resolvePeriod, parsePreset } from "@/lib/report-periods";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportHeader } from "@/components/report-header";
import { ReportSectionTable } from "@/components/report-section-table";
import { PeriodSelector } from "@/components/period-selector";

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireOrg();
  const period = resolvePeriod(parsePreset(sp.preset));
  const asOf = period.end;
  const bs = await balanceSheet(ctx.organizationId, asOf);

  return (
    <>
      <PeriodSelector basePath="/reports/balance-sheet" active={period.preset} />
      <Card>
        <CardContent className="pt-6">
          <ReportHeader
            title="Balance Sheet"
            organizationName={ctx.organizationName}
            periodLabel={`As of ${formatDate(asOf)}`}
          />

          <ReportSectionTable title="Assets" section={bs.assets} totalLabel="Total Assets" />

          <ReportSectionTable
            title="Liabilities"
            section={bs.liabilities}
            totalLabel="Total Liabilities"
          />

          <ReportSectionTable title="Equity" section={bs.equity} totalLabel="Total Equity (excl. income)" />
          <div className="mb-6 flex items-center justify-between py-1.5 text-sm">
            <span>Net Income (current period)</span>
            <span className="tabular-nums">{formatCents(bs.netIncomeCents)}</span>
          </div>

          <div className="mt-2 flex items-center justify-between border-t-4 border-double border-foreground py-2 text-base font-bold">
            <span>
              Liabilities + Equity{" "}
              {bs.balanced ? (
                <Badge variant="success">Balanced</Badge>
              ) : (
                <Badge variant="destructive">Out of balance</Badge>
              )}
            </span>
            <span className="tabular-nums">{formatCents(bs.liabilitiesPlusEquityCents)}</span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
