import Link from "next/link";
import { FileBarChart } from "lucide-react";
import { prisma, requireOrg } from "@/lib/tenant";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SECTION_LABELS: Record<string, string> = {
  PROFIT_LOSS: "Profit & Loss",
  PROFIT_LOSS_NONZERO: "P&L (Non-Zero)",
  BALANCE_SHEET: "Balance Sheet",
  CASH_FLOW: "Cash Flow",
  AR_AGING: "A/R Aging",
  AP_AGING: "A/P Aging",
};

export default async function ManagementReportsPage() {
  const ctx = await requireOrg();
  const reports = await prisma.managementReport.findMany({
    where: { organizationId: ctx.organizationId },
    include: { sections: { orderBy: { sortOrder: "asc" } } },
    orderBy: { lastModified: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Management Reports"
        description="Saved, branded report bundles. Open to view and print to PDF."
      />

      {reports.length === 0 ? (
        <EmptyState
          title="No saved reports"
          description="Management report templates appear here."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {reports.map((r) => (
            <Link key={r.id} href={`/management-reports/${r.id}`}>
              <Card className="transition-colors hover:border-foreground/30">
                <CardContent className="flex items-start gap-3 pt-6">
                  <FileBarChart className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.basis === "ACCRUAL" ? "Accrual" : "Cash"} basis · updated{" "}
                      {formatDate(r.lastModified)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.sections.map((s) => (
                        <Badge key={s.id} variant="secondary">
                          {SECTION_LABELS[s.reportType] ?? s.reportType}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
