import { useRoute, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Send, Ban, Trash2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import {
  useGetInvoice,
  getGetInvoiceQueryKey,
  getListInvoicesQueryKey,
  getVoidInvoiceMutationOptions,
  getDeleteInvoiceMutationOptions,
} from "@workspace/api-client-react";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  SENT: "default",
  PARTIAL: "outline",
  PAID: "outline",
  OVERDUE: "destructive",
  VOID: "secondary",
};

export default function InvoiceDetailPage() {
  const [, params] = useRoute("/invoices/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: invoice, isLoading, error } = useGetInvoice(id);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetInvoiceQueryKey(id) });
    qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
  };
  const onError = (e: Error) =>
    toast({ title: "Error", description: e.message, variant: "destructive" });

  // Issue isn't in the OpenAPI spec yet; hand-rolled call, generated-key invalidation.
  const issueMutation = useMutation({
    mutationFn: () => apiFetch(`/invoices/${id}/issue`, { method: "POST" }),
    onSuccess: () => {
      refresh();
      toast({ title: "Invoice issued" });
    },
    onError,
  });

  const voidMutation = useMutation(
    getVoidInvoiceMutationOptions({
      mutation: {
        onSuccess: () => {
          refresh();
          toast({ title: "Invoice voided" });
        },
        onError,
      },
    }),
  );

  const deleteMutation = useMutation(
    getDeleteInvoiceMutationOptions({
      mutation: {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
          navigate("/invoices");
        },
        onError,
      },
    }),
  );

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (error || !invoice) return <div className="text-sm text-destructive">Invoice not found.</div>;

  const isDraft = invoice.status === "DRAFT";
  const isVoid = invoice.status === "VOID";

  return (
    <>
      <div className="mb-6">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to invoices
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Invoice {invoice.number}</h1>
            <p className="text-sm text-muted-foreground">
              {invoice.customerName} · Issued {formatDate(invoice.issueDate)} · Due{" "}
              {formatDate(invoice.dueDate)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Badge variant={STATUS_VARIANT[invoice.status]}>{invoice.status}</Badge>
            {isDraft && (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/invoices/${id}/edit`}>
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Link>
                </Button>
                <Button onClick={() => issueMutation.mutate()} disabled={issueMutation.isPending}>
                  <Send className="h-4 w-4 mr-1" /> {issueMutation.isPending ? "Issuing…" : "Issue"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
                      <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate({ id })}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {!isDraft && !isVoid && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Ban className="h-4 w-4 mr-1" /> Void
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Void this invoice?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A reversing journal entry will be posted. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => voidMutation.mutate({ id })}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Void invoice
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lineItems.map((li) => (
                <TableRow key={li.id}>
                  <TableCell>{li.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{li.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(li.unitPriceCents)}
                  </TableCell>
                  {/* Per-line tax is not stored; document-level tax shows in the totals. */}
                  <TableCell className="text-right tabular-nums">—</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(li.amountCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <div className="w-64 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{formatCents(invoice.subtotalCents)}</span>
          </div>
          {invoice.taxCents > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">{formatCents(invoice.taxCents)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold border-t pt-2">
            <span>Total</span>
            <span className="tabular-nums">{formatCents(invoice.totalCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Balance due</span>
            <span className="tabular-nums font-medium">{formatCents(invoice.balanceCents)}</span>
          </div>
        </div>
      </div>
    </>
  );
}
