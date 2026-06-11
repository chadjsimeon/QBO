import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
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
interface Estimate {
  id: string;
  number: string;
  status: string;
  customerName: string | null;
  issueDate: string;
  expiryDate: string | null;
  memo: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  convertedInvoiceId: string | null;
  lineItems: LineItem[];
}

export default function EstimateDetailPage() {
  const [, params] = useRoute("/estimates/:id");
  const [, navigate] = useLocation();
  const id = params?.id;
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: est } = useQuery({
    queryKey: ["estimate", id],
    queryFn: () => apiFetch<Estimate>(`/estimates/${id}`),
    enabled: !!id,
  });

  const setStatus = useMutation({
    mutationFn: (status: string) =>
      apiFetch(`/estimates/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimate", id] });
      qc.invalidateQueries({ queryKey: ["estimates"] });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const convert = useMutation({
    mutationFn: () =>
      apiFetch<{ invoiceId: string }>(`/estimates/${id}/convert`, { method: "POST" }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Converted to invoice" });
      navigate(`/invoices/${d.invoiceId}`);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!est) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const converted = est.status === "CONVERTED";

  return (
    <>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link
            href="/estimates"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-3 w-3" /> Back to estimates
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{est.number}</h1>
            <StatusBadge status={est.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {est.customerName ?? "—"} · {formatDate(est.issueDate)}
            {est.expiryDate ? ` · expires ${formatDate(est.expiryDate)}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {!converted && est.status !== "SENT" && (
            <Button variant="outline" size="sm" onClick={() => setStatus.mutate("SENT")}>
              Mark sent
            </Button>
          )}
          {!converted && est.status !== "ACCEPTED" && (
            <Button variant="outline" size="sm" onClick={() => setStatus.mutate("ACCEPTED")}>
              Mark accepted
            </Button>
          )}
          {converted ? (
            <Button size="sm" asChild>
              <Link href={`/invoices/${est.convertedInvoiceId}`}>
                View invoice <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          ) : (
            <Button size="sm" disabled={convert.isPending} onClick={() => convert.mutate()}>
              Convert to invoice
            </Button>
          )}
        </div>
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
              {est.lineItems.map((l) => (
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
              <div>{formatCents(est.subtotalCents)}</div>
              <div>{formatCents(est.taxCents)}</div>
              <div className="font-semibold">{formatCents(est.totalCents)}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
