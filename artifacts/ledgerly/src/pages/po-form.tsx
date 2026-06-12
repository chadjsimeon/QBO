import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListVendors, useListAccounts, useListTaxRates } from "@workspace/api-client-react";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { apiFetch, formatCents, toDateInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface Line {
  description: string;
  quantity: number;
  unitPriceCents: number;
  accountId: string;
  taxRateId: string;
}
const EMPTY: Line = {
  description: "",
  quantity: 1,
  unitPriceCents: 0,
  accountId: "",
  taxRateId: "",
};

export default function PoFormPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    vendorId: "",
    number: "",
    issueDate: toDateInput(new Date()),
    expectedDate: "",
    memo: "",
  });
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY }]);

  const { data: vendors = [] } = useListVendors();
  const { data: accounts = [] } = useListAccounts();
  const { data: taxRates = [] } = useListTaxRates();
  const { data: count } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: () => apiFetch<unknown[]>("/purchase-orders"),
    select: (d: unknown[]) => d.length,
  });
  useEffect(() => {
    if (count !== undefined && !form.number)
      setForm((f) => ({ ...f, number: `PO-${String(count + 1).padStart(4, "0")}` }));
  }, [count]);

  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE");
  const updateLine = (i: number, f: keyof Line, v: string | number) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [f]: v } : l)));
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
  const valid = form.vendorId && subtotal > 0 && lines.every((l) => l.accountId && l.description);

  const save = useMutation({
    mutationFn: () =>
      apiFetch("/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          expectedDate: form.expectedDate || undefined,
          lines: lines.map((l) => ({ ...l, taxRateId: l.taxRateId || undefined })),
        }),
      }),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Purchase order created" });
      navigate(`/purchase-orders/${d.id}`);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="mb-6">
        <Link
          href="/purchase-orders"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to purchase orders
        </Link>
        <h1 className="text-2xl font-bold">New purchase order</h1>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Supplier *</Label>
              <Select
                value={form.vendorId}
                onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))}
                required
              >
                <option value="">Select supplier…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>PO no. *</Label>
              <Input
                value={form.number}
                onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Issue date *</Label>
              <Input
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Expected date</Label>
              <Input
                type="date"
                value={form.expectedDate}
                onChange={(e) => setForm((f) => ({ ...f, expectedDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Memo</Label>
              <Input
                value={form.memo}
                onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Line items</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLines((ls) => [...ls, { ...EMPTY }])}
              >
                <Plus className="h-4 w-4 mr-1" /> Add line
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-12 sm:col-span-4">
                  <Input
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) => updateLine(i, "description", e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Input
                    type="number"
                    placeholder="Qty"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateLine(i, "quantity", parseInt(e.target.value) || 1)}
                    required
                  />
                </div>
                <div className="col-span-8 sm:col-span-2">
                  <Input
                    type="number"
                    placeholder="Price (cents)"
                    min={0}
                    value={line.unitPriceCents}
                    onChange={(e) => updateLine(i, "unitPriceCents", parseInt(e.target.value) || 0)}
                    required
                  />
                </div>
                <div className="col-span-6 sm:col-span-2">
                  <Select
                    value={line.accountId}
                    onChange={(e) => updateLine(i, "accountId", e.target.value)}
                  >
                    <option value="">Category…</option>
                    {expenseAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} {a.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="col-span-5 sm:col-span-1">
                  <Select
                    value={line.taxRateId}
                    onChange={(e) => updateLine(i, "taxRateId", e.target.value)}
                  >
                    <option value="">No tax</option>
                    {taxRates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="col-span-1 flex items-center justify-center">
                  {lines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <div className="flex justify-end pt-2 text-sm">
              <span className="text-muted-foreground mr-4">Subtotal:</span>
              <span className="tabular-nums font-medium">{formatCents(subtotal)}</span>
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <Link href="/purchase-orders">Cancel</Link>
          </Button>
          <Button type="submit" disabled={save.isPending || !valid}>
            {save.isPending ? "Saving…" : "Create purchase order"}
          </Button>
        </div>
      </form>
    </>
  );
}
