import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

interface Invoice {
  id: string; number: string; customerId: string; customerName: string | null;
  status: string; issueDate: string; dueDate: string;
  subtotalCents: number; taxCents: number; totalCents: number; balanceCents: number;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary", SENT: "default", PARTIAL: "outline", PAID: "outline",
  OVERDUE: "destructive", VOID: "secondary",
};

export default function InvoicesPage() {
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => apiFetch<Invoice[]>("/invoices"),
  });

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-muted-foreground">Money owed to you by customers.</p>
        </div>
        <Link href="/invoices/new">
          <Button><Plus className="h-4 w-4 mr-1" /> New invoice</Button>
        </Link>
      </div>

      {invoices.length === 0 ? (
        <EmptyState title="No invoices yet" description="Create an invoice and issue it to a customer."
          action={<Link href="/invoices/new"><Button><Plus className="h-4 w-4 mr-1" />New invoice</Button></Link>} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map(inv => (
                <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/30">
                  <TableCell className="font-medium">
                    <Link href={`/invoices/${inv.id}`} className="hover:underline">{inv.number}</Link>
                  </TableCell>
                  <TableCell>{inv.customerName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(inv.issueDate)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(inv.dueDate)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[inv.status] ?? "secondary"} className="text-xs">
                      {inv.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(inv.totalCents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(inv.balanceCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
