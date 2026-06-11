import { useState, useEffect } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { apiFetch, formatCents, toDateInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface Customer {
  id: string;
  name: string;
}
interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype?: string;
  systemRole?: string | null;
}
interface TaxRate {
  id: string;
  name: string;
  rateBps: number;
}
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
const isBank = (a: Account) => a.subtype === "bank" || a.systemRole === "CASH";

export default function SalesReceiptFormPage() {
  const [, navigate] = useLocation();
  const refund = new URLSearchParams(useSearch()).get("mode") === "refund";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    customerId: "",
    depositAccountId: "",
    number: "",
    date: toDateInput(new Date()),
    memo: "",
  });
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY }]);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => apiFetch<Customer[]>("/customers"),
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetch<Account[]>("/accounts"),
  });
  const { data: taxRates = [] } = useQuery({
    queryKey: ["tax-rates"],
    queryFn: () => apiFetch<TaxRate[]>("/tax-rates"),
  });
  const { data: count } = useQuery({
    queryKey: ["sales-receipts"],
    queryFn: () => apiFetch<unknown[]>("/sales-receipts"),
    select: (d: unknown[]) => d.length,
  });

  const prefix = refund ? "RR" : "SR";
  useEffect(() => {
    if (count !== undefined && !form.number)
      setForm((f) => ({ ...f, number: `${prefix}-${String(count + 1).padStart(4, "0")}` }));
  }, [count]);

  const banks = accounts.filter(isBank);
  const incomeAccounts = accounts.filter((a) => a.type === "INCOME");

  const save = useMutation({
    mutationFn: () =>
      apiFetch("/sales-receipts", {
        method: "POST",
        body: JSON.stringify({
          customerId: form.customerId || undefined,
          depositAccountId: form.depositAccountId,
          number: form.number,
          isRefund: refund,
          date: form.date,
          memo: form.memo,
          lines: lines.map((l) => ({ ...l, taxRateId: l.taxRateId || undefined })),
        }),
      }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["sales-receipts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast({ title: refund ? "Refund recorded" : "Sales receipt recorded" });
      navigate(`/sales-receipts/${data.id}`);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateLine = (i: number, f: keyof Line, v: string | number) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [f]: v } : l)));
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
  const valid =
    form.depositAccountId && subtotal > 0 && lines.every((l) => l.accountId && l.description);

  return (
    <>
      <div className="mb-6">
        <Link
          href="/sales-receipts"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to sales receipts
        </Link>
        <h1 className="text-2xl font-bold">
          {refund ? "New refund receipt" : "New sales receipt"}
        </h1>
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
              <Label>Customer</Label>
              <Select
                value={form.customerId}
                onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
              >
                <option value="">— none —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{refund ? "Refund from *" : "Deposit to *"}</Label>
              <Select
                value={form.depositAccountId}
                onChange={(e) => setForm((f) => ({ ...f, depositAccountId: e.target.value }))}
                required
              >
                <option value="">Select account…</option>
                {banks.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Number *</Label>
              <Input
                value={form.number}
                onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
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
                    <option value="">Income…</option>
                    {incomeAccounts.map((a) => (
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
            <Link href="/sales-receipts">Cancel</Link>
          </Button>
          <Button type="submit" disabled={save.isPending || !valid}>
            {save.isPending ? "Saving…" : refund ? "Record refund" : "Record sale"}
          </Button>
        </div>
      </form>
    </>
  );
}
