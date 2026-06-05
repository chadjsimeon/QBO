import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

interface CreditNote { id: string; number: string; customerName: string | null; date: string; totalCents: number; balanceCents: number; }

export default function CreditNotesPage() {
  const { data: notes = [] } = useQuery({ queryKey: ["credit-notes"], queryFn: () => apiFetch<CreditNote[]>("/credit-notes") });
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-3xl font-bold tracking-tight">Credit notes</h1>
          <p className="text-sm text-muted-foreground mt-1">Customer credits you can apply against open invoices.</p></div>
        <Link href="/credit-notes/new"><Button><Plus className="h-4 w-4 mr-1" /> New credit note</Button></Link>
      </div>
      {notes.length === 0 ? (
        <EmptyState title="No credit notes yet" description="Issue a customer credit and apply it to their invoices."
          action={<Link href="/credit-notes/new"><Button><Plus className="h-4 w-4 mr-1" />New credit note</Button></Link>} />
      ) : (
        <Card className="shadow-md overflow-hidden">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>No.</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Remaining</TableHead></TableRow></TableHeader>
            <TableBody>
              {notes.map(n => (
                <TableRow key={n.id} className="cursor-pointer">
                  <TableCell className="text-muted-foreground"><Link href={`/credit-notes/${n.id}`} className="hover:underline text-primary">{formatDate(n.date)}</Link></TableCell>
                  <TableCell className="font-medium">{n.number}</TableCell>
                  <TableCell>{n.customerName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(n.totalCents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(n.balanceCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
