import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { AGING_BUCKETS, type AgingReport } from "@/lib/reports";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function AgingTable({
  report,
  contactLabel,
}: {
  report: AgingReport;
  contactLabel: string;
}) {
  if (report.rows.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">Nothing outstanding. 🎉</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Document</TableHead>
          <TableHead>{contactLabel}</TableHead>
          <TableHead>Due</TableHead>
          {AGING_BUCKETS.map((b) => (
            <TableHead key={b} className="text-right">
              {b}
            </TableHead>
          ))}
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.number}</TableCell>
            <TableCell>{row.contactName}</TableCell>
            <TableCell className="text-muted-foreground">{formatDate(row.dueDate)}</TableCell>
            {AGING_BUCKETS.map((_, i) => (
              <TableCell key={i} className="text-right tabular-nums">
                {row.bucket === i ? formatCents(row.balanceCents) : ""}
              </TableCell>
            ))}
            <TableCell className="text-right tabular-nums">{formatCents(row.balanceCents)}</TableCell>
          </TableRow>
        ))}
        <TableRow className="border-t-2 font-bold">
          <TableCell colSpan={3}>Total</TableCell>
          {report.bucketTotals.map((t, i) => (
            <TableCell key={i} className="text-right tabular-nums">
              {formatCents(t)}
            </TableCell>
          ))}
          <TableCell className="text-right tabular-nums">{formatCents(report.totalCents)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
