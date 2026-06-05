import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

interface SalesReceipt {
  id: string; number: string; isRefund: boolean; customerName: string | null;
  depositAccountName: string | null; date: string; totalCents: number;
}

export default function SalesReceiptsPage() {
  const { data: receipts = [] } = useQuery({ queryKey: ["sales-receipts"], queryFn: () => apiFetch<SalesReceipt[]>("/sales-receipts") });

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales receipts</h1>
          <p className="text-sm text-muted-foreground mt-1">Immediate cash sales and customer refunds.</p>
        </div>
        <Link href="/sales-receipts/new"><Button><Plus className="h-4 w-4 mr-1" /> New sales receipt</Button></Link>
      </div>

      {receipts.length === 0 ? (
        <EmptyState title="No sales receipts yet" description="Record a cash sale that's paid right away."
          action={<Link href="/sales-receipts/new"><Button><Plus className="h-4 w-4 mr-1" />New sales receipt</Button></Link>} />
      ) : (
        <Card className="shadow-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>No.</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.map(r => (
                <TableRow key={r.id} className="cursor-pointer">
                  <TableCell className="text-muted-foreground">
                    <Link href={`/sales-receipts/${r.id}`} className="hover:underline text-primary">{formatDate(r.date)}</Link>
                  </TableCell>
                  <TableCell className="font-medium">{r.number}</TableCell>
                  <TableCell>{r.isRefund ? <span className="text-destructive">Refund</span> : "Sale"}</TableCell>
                  <TableCell>{r.customerName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.depositAccountName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.isRefund ? "−" : ""}{formatCents(r.totalCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
