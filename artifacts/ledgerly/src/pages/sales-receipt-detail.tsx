import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { ArrowLeft, Ban } from "lucide-react";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
}
interface SalesReceipt {
  id: string;
  number: string;
  isRefund: boolean;
  customerName: string | null;
  depositAccountName: string | null;
  date: string;
  memo: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  lineItems: LineItem[];
}

export default function SalesReceiptDetailPage() {
  const [, params] = useRoute("/sales-receipts/:id");
  const [, navigate] = useLocation();
  const id = params?.id;
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: sr } = useQuery({
    queryKey: ["sales-receipt", id],
    queryFn: () => apiFetch<SalesReceipt>(`/sales-receipts/${id}`),
    enabled: !!id,
  });

  const voidIt = useMutation({
    mutationFn: () => apiFetch(`/sales-receipts/${id}/void`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-receipts"] });
      toast({ title: "Voided" });
      navigate("/sales-receipts");
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!sr) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link
            href="/sales-receipts"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-3 w-3" /> Back to sales receipts
          </Link>
          <h1 className="text-2xl font-bold">
            {sr.number} {sr.isRefund && <span className="text-destructive text-lg">(Refund)</span>}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sr.customerName ?? "No customer"} · {sr.isRefund ? "refunded from" : "deposited to"}{" "}
            {sr.depositAccountName ?? "—"} · {formatDate(sr.date)}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (confirm("Void this receipt? A reversing entry will be posted.")) voidIt.mutate();
          }}
          disabled={voidIt.isPending}
        >
          <Ban className="h-4 w-4 mr-1" /> Void
        </Button>
      </div>

      <Card className="shadow-md overflow-hidden">
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
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
              {sr.lineItems.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(l.unitPriceCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(l.amountCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-end gap-12 border-t px-4 py-3 text-sm">
            <div className="space-y-1 text-right text-muted-foreground">
              <div>Subtotal</div>
              <div>Tax</div>
              <div className="font-semibold text-foreground">Total</div>
            </div>
            <div className="space-y-1 text-right tabular-nums">
              <div>{formatCents(sr.subtotalCents)}</div>
              <div>{formatCents(sr.taxCents)}</div>
              <div className="font-semibold">{formatCents(sr.totalCents)}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
