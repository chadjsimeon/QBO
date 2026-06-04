import { useQuery } from "@tanstack/react-query";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

interface Payment {
  id: string; direction: "RECEIVED" | "SENT";
  customerId: string | null; customerName: string | null;
  vendorId: string | null; vendorName: string | null;
  amountCents: number; date: string; method: string; memo: string | null;
}

export default function PaymentsPage() {
  const { data: payments = [] } = useQuery({
    queryKey: ["payments"],
    queryFn: () => apiFetch<Payment[]>("/payments"),
  });

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">All money received and sent.</p>
      </div>

      {payments.length === 0 ? (
        <EmptyState title="No payments yet" description="Payments are recorded when you allocate money against invoices or bills." />
      ) : (
        <Card className="shadow-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Memo</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="text-muted-foreground">{formatDate(p.date)}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.direction} />
                  </TableCell>
                  <TableCell>{p.customerName ?? p.vendorName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground capitalize text-sm">
                    {p.method.replace(/_/g, " ").toLowerCase()}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{p.memo ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(p.amountCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
