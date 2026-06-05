import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

interface Estimate { id: string; number: string; status: string; customerName: string | null; issueDate: string; totalCents: number; }

export default function EstimatesPage() {
  const { data: estimates = [] } = useQuery({ queryKey: ["estimates"], queryFn: () => apiFetch<Estimate[]>("/estimates") });
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-3xl font-bold tracking-tight">Estimates</h1>
          <p className="text-sm text-muted-foreground mt-1">Quotes you can convert into invoices.</p></div>
        <Link href="/estimates/new"><Button><Plus className="h-4 w-4 mr-1" /> New estimate</Button></Link>
      </div>
      {estimates.length === 0 ? (
        <EmptyState title="No estimates yet" description="Create a quote and convert it to an invoice when accepted."
          action={<Link href="/estimates/new"><Button><Plus className="h-4 w-4 mr-1" />New estimate</Button></Link>} />
      ) : (
        <Card className="shadow-md overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Customer</TableHead><TableHead>Issued</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {estimates.map(e => (
                <TableRow key={e.id} className="cursor-pointer">
                  <TableCell className="font-medium"><Link href={`/estimates/${e.id}`} className="hover:underline text-primary">{e.number}</Link></TableCell>
                  <TableCell>{e.customerName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(e.issueDate)}</TableCell>
                  <TableCell><StatusBadge status={e.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(e.totalCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
