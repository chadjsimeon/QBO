import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  amountCents: number;
}
interface Application {
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  amountCents: number;
}
interface CreditNote {
  id: string;
  number: string;
  customerId: string;
  customerName: string | null;
  date: string;
  memo: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  balanceCents: number;
  lineItems: LineItem[];
  applications: Application[];
}
interface Invoice {
  id: string;
  number: string;
  customerId: string;
  status: string;
  balanceCents: number;
}

export default function CreditNoteDetailPage() {
  const [, params] = useRoute("/credit-notes/:id");
  const id = params?.id;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  const { data: cn } = useQuery({
    queryKey: ["credit-note", id],
    queryFn: () => apiFetch<CreditNote>(`/credit-notes/${id}`),
    enabled: !!id,
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => apiFetch<Invoice[]>("/invoices"),
  });

  const apply = useMutation({
    mutationFn: (applications: Array<{ invoiceId: string; amountCents: number }>) =>
      apiFetch(`/credit-notes/${id}/apply`, {
        method: "POST",
        body: JSON.stringify({ applications }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credit-note", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setAmounts({});
      toast({ title: "Credit applied" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!cn) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const openInvoices = invoices.filter(
    (i) =>
      i.customerId === cn.customerId &&
      i.balanceCents > 0 &&
      ["SENT", "PARTIAL", "OVERDUE"].includes(i.status),
  );
  const applications = Object.entries(amounts)
    .map(([invoiceId, amountCents]) => ({ invoiceId, amountCents }))
    .filter((a) => a.amountCents > 0);
  const toApply = applications.reduce((s, a) => s + a.amountCents, 0);

  return (
    <>
      <div className="mb-6">
        <Link
          href="/credit-notes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to credit notes
        </Link>
        <h1 className="text-2xl font-bold">{cn.number}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {cn.customerName ?? "—"} · {formatDate(cn.date)}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-md overflow-hidden">
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cn.lineItems.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.description}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(l.amountCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end gap-12 border-t px-4 py-3 text-sm">
              <div className="space-y-1 text-right text-muted-foreground">
                <div>Total</div>
                <div className="font-semibold text-foreground">Credit remaining</div>
              </div>
              <div className="space-y-1 text-right tabular-nums">
                <div>{formatCents(cn.totalCents)}</div>
                <div className="font-semibold">{formatCents(cn.balanceCents)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Apply to invoices</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cn.balanceCents <= 0 ? (
                <p className="text-sm text-muted-foreground">Fully applied.</p>
              ) : openInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open invoices for this customer.</p>
              ) : (
                <>
                  {openInvoices.map((inv) => (
                    <div key={inv.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1">
                        {inv.number}
                        <span className="text-muted-foreground">
                          {" "}
                          · {formatCents(inv.balanceCents)}
                        </span>
                      </span>
                      <Input
                        className="w-28 text-right"
                        type="number"
                        min={0}
                        placeholder="cents"
                        value={amounts[inv.id] || ""}
                        onChange={(e) =>
                          setAmounts((a) => ({ ...a, [inv.id]: parseInt(e.target.value) || 0 }))
                        }
                      />
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t pt-3 text-sm">
                    <span className="text-muted-foreground">Applying {formatCents(toApply)}</span>
                    <Button
                      size="sm"
                      disabled={apply.isPending || toApply <= 0 || toApply > cn.balanceCents}
                      onClick={() => apply.mutate(applications)}
                    >
                      Apply
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {cn.applications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Applied</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {cn.applications.map((a) => (
                  <div key={a.id} className="flex justify-between">
                    <span>{a.invoiceNumber ?? "—"}</span>
                    <span className="tabular-nums">{formatCents(a.amountCents)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
