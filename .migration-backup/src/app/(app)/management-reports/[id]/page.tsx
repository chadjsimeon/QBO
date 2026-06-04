import { notFound } from "next/navigation";
import type { ManagementReportType } from "@prisma/client";
import { prisma, requireOrg } from "@/lib/tenant";
import { profitAndLoss, balanceSheet, arAging, apAging } from "@/lib/reports";
import { resolvePeriod } from "@/lib/report-periods";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { ReportSectionTable } from "@/components/report-section-table";
import { AgingTable } from "@/components/aging-table";
import { PrintButton } from "@/components/print-button";

const SECTION_TITLES: Record<ManagementReportType, string> = {
  PROFIT_LOSS: "Profit & Loss",
  PROFIT_LOSS_NONZERO: "Profit & Loss — Non-Zero",
  BALANCE_SHEET: "Balance Sheet",
  CASH_FLOW: "Statement of Cash Flows",
  AR_AGING: "A/R Aging Summary",
  AP_AGING: "A/P Aging Summary",
};

export default async function ManagementReportDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrg();
  const report = await prisma.managementReport.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { sections: { orderBy: { sortOrder: "asc" } } },
  });
  if (!report) notFound();

  const today = new Date();
  const period = resolvePeriod(
    report.periodPreset,
    today,
    report.periodStart && report.periodEnd
      ? {
          start: report.periodStart.toISOString().slice(0, 10),
          end: report.periodEnd.toISOString().slice(0, 10),
        }
      : undefined
  );

  return (
    <div className="space-y-8">
      <div className="no-print flex justify-end">
        <PrintButton />
      </div>

      {/* Cover page */}
      <Card className="page-break">
        <CardContent className="flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
          {report.logoUrl || ctx.organizationName ? (
            <div className="mb-6 text-2xl font-bold">{ctx.organizationName}</div>
          ) : null}
          <h1 className="text-4xl font-bold tracking-tight">{report.name}</h1>
          <p className="mt-3 text-lg text-muted-foreground">{period.label}</p>
          <div className="mt-10 space-y-1 text-sm text-muted-foreground">
            {report.preparedByName && <div>Prepared by {report.preparedByName}</div>}
            <div>Prepared on {formatDate(today)}</div>
            <div>{report.basis === "ACCRUAL" ? "Accrual basis" : "Cash basis"}</div>
          </div>
          {report.confidentialityNote && (
            <div className="mt-12 rounded border border-dashed px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
              {report.confidentialityNote}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table of contents */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-3 text-lg font-semibold">Contents</h2>
          <ol className="space-y-1 text-sm">
            {report.sections.map((s, i) => (
              <li key={s.id} className="flex justify-between border-b border-dashed py-1">
                <span>
                  {i + 1}. {SECTION_TITLES[s.reportType]}
                </span>
                <span className="text-muted-foreground">Page {i + 2}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Sections */}
      {await Promise.all(
        report.sections.map(async (section) => (
          <Card key={section.id} className="page-break">
            <CardContent className="pt-6">
              <div className="mb-4 border-b pb-3">
                <div className="text-sm font-semibold">{ctx.organizationName}</div>
                <h2 className="text-xl font-bold">{SECTION_TITLES[section.reportType]}</h2>
                <div className="text-xs text-muted-foreground">
                  {report.basis === "ACCRUAL" ? "Accrual Basis" : "Cash Basis"} · {period.label}
                </div>
              </div>
              {await renderSection(section.reportType, ctx.organizationId, period, today)}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

async function renderSection(
  type: ManagementReportType,
  orgId: string,
  period: { start: Date; end: Date },
  today: Date
) {
  switch (type) {
    case "PROFIT_LOSS":
    case "PROFIT_LOSS_NONZERO": {
      const pl = await profitAndLoss(
        orgId,
        { start: period.start, end: period.end },
        { nonZero: type === "PROFIT_LOSS_NONZERO" }
      );
      return (
        <>
          <ReportSectionTable title="Income" section={pl.income} totalLabel="Total Income" />
          <ReportSectionTable title="Expenses" section={pl.expenses} totalLabel="Total Expenses" />
          <div className="mt-2 flex items-center justify-between border-t-4 border-double border-foreground py-2 font-bold">
            <span>Net Income</span>
            <span className="tabular-nums">{formatCents(pl.netIncomeCents)}</span>
          </div>
        </>
      );
    }
    case "BALANCE_SHEET": {
      const bs = await balanceSheet(orgId, period.end);
      return (
        <>
          <ReportSectionTable title="Assets" section={bs.assets} totalLabel="Total Assets" />
          <ReportSectionTable title="Liabilities" section={bs.liabilities} totalLabel="Total Liabilities" />
          <ReportSectionTable title="Equity" section={bs.equity} totalLabel="Total Equity (excl. income)" />
          <div className="mb-2 flex items-center justify-between py-1.5 text-sm">
            <span>Net Income (current period)</span>
            <span className="tabular-nums">{formatCents(bs.netIncomeCents)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t-4 border-double border-foreground py-2 font-bold">
            <span>Liabilities + Equity</span>
            <span className="tabular-nums">{formatCents(bs.liabilitiesPlusEquityCents)}</span>
          </div>
        </>
      );
    }
    case "AR_AGING": {
      const aging = await arAging(orgId, today);
      return <AgingTable report={aging} contactLabel="Customer" />;
    }
    case "AP_AGING": {
      const aging = await apAging(orgId, today);
      return <AgingTable report={aging} contactLabel="Vendor" />;
    }
    case "CASH_FLOW":
    default:
      return (
        <p className="text-sm text-muted-foreground">
          Statement of Cash Flows (indirect method) is planned for MVP2.
        </p>
      );
  }
}
