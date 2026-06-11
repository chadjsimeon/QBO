import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Trash2, ArrowLeft, CheckCircle } from "lucide-react";
import { Link } from "wouter";
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
  OPEN: "default",
  PARTIAL: "outline",
  PAID: "outline",
  OVERDUE: "destructive",
  VOID: "secondary",
};

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  taxCents: number;
}

interface Bill {
  id: string;
  number: string;
  vendorId: string;
  vendorName: string | null;
  status: string;
  issueDate: string;
  dueDate: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  balanceCents: number;
  lineItems: LineItem[];
}

export default function BillDetailPage() {
  const [, params] = useRoute("/bills/:id");
  const [, navigate] = useLocation();
  const id = params?.id ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const {
    data: bill,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["bill", id],
    queryFn: () => apiFetch<Bill>(`/bills/${id}`),
    enabled: !!id,
  });

  const enterMutation = useMutation({
    mutationFn: () => apiFetch(`/bills/${id}/enter`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bill", id] });
      qc.invalidateQueries({ queryKey: ["bills"] });
      toast({ title: "Bill entered — status is now OPEN" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const voidMutation = useMutation({
    mutationFn: () => apiFetch(`/bills/${id}/void`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bill", id] });
      qc.invalidateQueries({ queryKey: ["bills"] });
      toast({ title: "Bill voided" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/bills/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      navigate("/bills");
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (error || !bill) return <div className="text-sm text-destructive">Bill not found.</div>;

  const isDraft = bill.status === "DRAFT";
  const isVoid = bill.status === "VOID";

  return (
    <>
      <div className="mb-6">
        <Link
          href="/bills"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to bills
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Bill {bill.number}</h1>
            <p className="text-sm text-muted-foreground">
              {bill.vendorName} · Issued {formatDate(bill.issueDate)} · Due{" "}
              {formatDate(bill.dueDate)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[bill.status]}>{bill.status}</Badge>
            {isDraft && (
              <>
                <Button
                  onClick={() => enterMutation.mutate()}
                  disabled={enterMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {enterMutation.isPending ? "Entering…" : "Enter bill"}
                </Button>
                <Button variant="outline" asChild>
                  <Link href={`/bills/${id}/edit`}>Edit</Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete bill?</AlertDialogTitle>
                      <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate()}
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
                    <AlertDialogTitle>Void this bill?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will mark the bill as void. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => voidMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Void bill
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
              {bill.lineItems.map((li) => (
                <TableRow key={li.id}>
                  <TableCell>{li.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{li.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(li.unitPriceCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {li.taxCents > 0 ? formatCents(li.taxCents) : "—"}
                  </TableCell>
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
            <span className="tabular-nums">{formatCents(bill.subtotalCents)}</span>
          </div>
          {bill.taxCents > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">{formatCents(bill.taxCents)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold border-t pt-2">
            <span>Total</span>
            <span className="tabular-nums">{formatCents(bill.totalCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Balance due</span>
            <span className="tabular-nums font-medium">{formatCents(bill.balanceCents)}</span>
          </div>
        </div>
      </div>
    </>
  );
}
