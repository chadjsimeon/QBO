import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

interface Bill {
  id: string; number: string; vendorId: string; vendorName: string | null;
  status: string; issueDate: string; dueDate: string;
  subtotalCents: number; taxCents: number; totalCents: number; balanceCents: number;
}

export default function BillsPage() {
  const { data: bills = [] } = useQuery({
    queryKey: ["bills"],
    queryFn: () => apiFetch<Bill[]>("/bills"),
  });

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bills</h1>
          <p className="text-sm text-muted-foreground mt-1">Money you owe to vendors.</p>
        </div>
        <Link href="/bills/new">
          <Button><Plus className="h-4 w-4 mr-1" /> New bill</Button>
        </Link>
      </div>

      {bills.length === 0 ? (
        <EmptyState title="No bills yet" description="Record a bill from a vendor to start tracking payables."
          action={<Link href="/bills/new"><Button><Plus className="h-4 w-4 mr-1" />New bill</Button></Link>} />
      ) : (
        <Card className="shadow-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map(bill => (
                <TableRow key={bill.id}>
                  <TableCell className="font-medium">{bill.number}</TableCell>
                  <TableCell>{bill.vendorName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(bill.issueDate)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(bill.dueDate)}</TableCell>
                  <TableCell>
                    <StatusBadge status={bill.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(bill.totalCents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(bill.balanceCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
