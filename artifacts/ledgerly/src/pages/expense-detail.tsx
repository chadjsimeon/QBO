import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { ArrowLeft, Ban } from "lucide-react";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface LineItem { id: string; description: string; quantity: number; unitPriceCents: number; amountCents: number; }
interface Expense {
  id: string; number: string; refNumber: string | null; method: string;
  vendorName: string | null; paymentAccountName: string | null; date: string; memo: string | null;
  subtotalCents: number; taxCents: number; totalCents: number; lineItems: LineItem[];
}

export default function ExpenseDetailPage() {
  const [, params] = useRoute("/expenses/:id");
  const [, navigate] = useLocation();
  const id = params?.id;
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: exp } = useQuery({ queryKey: ["expense", id], queryFn: () => apiFetch<Expense>(`/expenses/${id}`), enabled: !!id });

  const voidIt = useMutation({
    mutationFn: () => apiFetch(`/expenses/${id}/void`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); toast({ title: "Expense voided" }); navigate("/expenses"); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!exp) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link href="/expenses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="h-3 w-3" /> Back to expenses
          </Link>
          <h1 className="text-2xl font-bold">{exp.number}{exp.refNumber ? ` · #${exp.refNumber}` : ""}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {exp.vendorName ?? "No payee"} · paid from {exp.paymentAccountName ?? "—"} · {formatDate(exp.date)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { if (confirm("Void this expense? A reversing entry will be posted.")) voidIt.mutate(); }} disabled={voidIt.isPending}>
          <Ban className="h-4 w-4 mr-1" /> Void
        </Button>
      </div>

      <Card className="shadow-md overflow-hidden">
        <CardHeader><CardTitle>Categories</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exp.lineItems.map(l => (
                <TableRow key={l.id}>
                  <TableCell>{l.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(l.unitPriceCents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(l.amountCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-end gap-12 border-t px-4 py-3 text-sm">
            <div className="space-y-1 text-right text-muted-foreground">
              <div>Subtotal</div><div>Tax</div><div className="font-semibold text-foreground">Total</div>
            </div>
            <div className="space-y-1 text-right tabular-nums">
              <div>{formatCents(exp.subtotalCents)}</div><div>{formatCents(exp.taxCents)}</div>
              <div className="font-semibold">{formatCents(exp.totalCents)}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
