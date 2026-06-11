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
  billId: string;
  billNumber: string | null;
  amountCents: number;
}
interface VendorCredit {
  id: string;
  number: string;
  vendorId: string;
  vendorName: string | null;
  date: string;
  memo: string | null;
  totalCents: number;
  balanceCents: number;
  lineItems: LineItem[];
  applications: Application[];
}
interface Bill {
  id: string;
  number: string;
  vendorId: string;
  status: string;
  balanceCents: number;
}

export default function VendorCreditDetailPage() {
  const [, params] = useRoute("/vendor-credits/:id");
  const id = params?.id;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  const { data: vc } = useQuery({
    queryKey: ["vendor-credit", id],
    queryFn: () => apiFetch<VendorCredit>(`/vendor-credits/${id}`),
    enabled: !!id,
  });
  const { data: bills = [] } = useQuery({
    queryKey: ["bills"],
    queryFn: () => apiFetch<Bill[]>("/bills"),
  });

  const apply = useMutation({
    mutationFn: (applications: Array<{ billId: string; amountCents: number }>) =>
      apiFetch(`/vendor-credits/${id}/apply`, {
        method: "POST",
        body: JSON.stringify({ applications }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-credit", id] });
      qc.invalidateQueries({ queryKey: ["bills"] });
      setAmounts({});
      toast({ title: "Credit applied" });
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!vc) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const openBills = bills.filter(
    (b) =>
      b.vendorId === vc.vendorId &&
      b.balanceCents > 0 &&
      ["OPEN", "PARTIAL", "OVERDUE"].includes(b.status),
  );
  const applications = Object.entries(amounts)
    .map(([billId, amountCents]) => ({ billId, amountCents }))
    .filter((a) => a.amountCents > 0);
  const toApply = applications.reduce((s, a) => s + a.amountCents, 0);

  return (
    <>
      <div className="mb-6">
        <Link
          href="/vendor-credits"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to supplier credits
        </Link>
        <h1 className="text-2xl font-bold">{vc.number}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {vc.vendorName ?? "—"} · {formatDate(vc.date)}
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
                {vc.lineItems.map((l) => (
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
                <div>{formatCents(vc.totalCents)}</div>
                <div className="font-semibold">{formatCents(vc.balanceCents)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Apply to bills</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {vc.balanceCents <= 0 ? (
                <p className="text-sm text-muted-foreground">Fully applied.</p>
              ) : openBills.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open bills for this supplier.</p>
              ) : (
                <>
                  {openBills.map((bill) => (
                    <div key={bill.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1">
                        {bill.number}
                        <span className="text-muted-foreground">
                          {" "}
                          · {formatCents(bill.balanceCents)}
                        </span>
                      </span>
                      <Input
                        className="w-28 text-right"
                        type="number"
                        min={0}
                        placeholder="cents"
                        value={amounts[bill.id] || ""}
                        onChange={(e) =>
                          setAmounts((a) => ({ ...a, [bill.id]: parseInt(e.target.value) || 0 }))
                        }
                      />
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t pt-3 text-sm">
                    <span className="text-muted-foreground">Applying {formatCents(toApply)}</span>
                    <Button
                      size="sm"
                      disabled={apply.isPending || toApply <= 0 || toApply > vc.balanceCents}
                      onClick={() => apply.mutate(applications)}
                    >
                      Apply
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {vc.applications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Applied</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {vc.applications.map((a) => (
                  <div key={a.id} className="flex justify-between">
                    <span>{a.billNumber ?? "—"}</span>
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
