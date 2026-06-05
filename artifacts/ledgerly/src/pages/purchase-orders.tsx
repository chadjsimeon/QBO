import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

interface PurchaseOrder { id: string; number: string; status: string; vendorName: string | null; issueDate: string; totalCents: number; }

export default function PurchaseOrdersPage() {
  const { data: pos = [] } = useQuery({ queryKey: ["purchase-orders"], queryFn: () => apiFetch<PurchaseOrder[]>("/purchase-orders") });
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-3xl font-bold tracking-tight">Purchase orders</h1>
          <p className="text-sm text-muted-foreground mt-1">Orders you can convert into bills.</p></div>
        <Link href="/purchase-orders/new"><Button><Plus className="h-4 w-4 mr-1" /> New purchase order</Button></Link>
      </div>
      {pos.length === 0 ? (
        <EmptyState title="No purchase orders yet" description="Create a PO and convert it to a bill when received."
          action={<Link href="/purchase-orders/new"><Button><Plus className="h-4 w-4 mr-1" />New purchase order</Button></Link>} />
      ) : (
        <Card className="shadow-md overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Supplier</TableHead><TableHead>Issued</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {pos.map(p => (
                <TableRow key={p.id} className="cursor-pointer">
                  <TableCell className="font-medium"><Link href={`/purchase-orders/${p.id}`} className="hover:underline text-primary">{p.number}</Link></TableCell>
                  <TableCell>{p.vendorName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(p.issueDate)}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(p.totalCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
