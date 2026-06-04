import { requireOrg } from "@/lib/tenant";
import { arAging } from "@/lib/reports";
import { formatDate } from "@/lib/dates";
import { Card, CardContent } from "@/components/ui/card";
import { ReportHeader } from "@/components/report-header";
import { AgingTable } from "@/components/aging-table";

export default async function ArAgingPage() {
  const ctx = await requireOrg();
  const asOf = new Date();
  const report = await arAging(ctx.organizationId, asOf);

  return (
    <Card>
      <CardContent className="pt-6">
        <ReportHeader
          title="A/R Aging Summary"
          organizationName={ctx.organizationName}
          periodLabel={`As of ${formatDate(asOf)}`}
        />
        <AgingTable report={report} contactLabel="Customer" />
      </CardContent>
    </Card>
  );
}
