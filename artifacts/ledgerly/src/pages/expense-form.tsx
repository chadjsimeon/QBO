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

interface Vendor {
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
const isMoney = (a: Account) =>
  a.subtype === "bank" || a.subtype === "credit_card" || a.systemRole === "CASH";

export default function ExpenseFormPage() {
  const [, navigate] = useLocation();
  const mode = new URLSearchParams(useSearch()).get("mode");
  const cheque = mode === "cheque";
  const ccCredit = mode === "cc-credit";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    vendorId: "",
    paymentAccountId: "",
    number: "",
    refNumber: "",
    date: toDateInput(new Date()),
    memo: "",
  });
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY }]);

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors"],
    queryFn: () => apiFetch<Vendor[]>("/vendors"),
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
    queryKey: ["expenses"],
    queryFn: () => apiFetch<unknown[]>("/expenses"),
    select: (d: unknown[]) => d.length,
  });

  useEffect(() => {
    if (count !== undefined && !form.number)
      setForm((f) => ({ ...f, number: `EXP-${String(count + 1).padStart(4, "0")}` }));
  }, [count]);

  const payFrom = accounts.filter(
    ccCredit
      ? (a) => a.subtype === "credit_card"
      : cheque
        ? (a) => a.subtype === "bank" || a.systemRole === "CASH"
        : isMoney,
  );
  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE");

  const save = useMutation({
    mutationFn: () =>
      apiFetch("/expenses", {
        method: "POST",
        body: JSON.stringify({
          vendorId: form.vendorId || undefined,
          paymentAccountId: form.paymentAccountId,
          number: form.number,
          refNumber: form.refNumber || undefined,
          method: cheque ? "CHECK" : "BANK_TRANSFER",
          isCredit: ccCredit,
          date: form.date,
          memo: form.memo,
          lines: lines.map((l) => ({ ...l, taxRateId: l.taxRateId || undefined })),
        }),
      }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast({
        title: ccCredit
          ? "Credit card credit recorded"
          : cheque
            ? "Cheque recorded"
            : "Expense recorded",
      });
      navigate(`/expenses/${data.id}`);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateLine = (i: number, f: keyof Line, v: string | number) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [f]: v } : l)));
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
  const valid =
    form.paymentAccountId && subtotal > 0 && lines.every((l) => l.accountId && l.description);

  return (
    <>
      <div className="mb-6">
        <Link
          href="/expenses"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to expenses
        </Link>
        <h1 className="text-2xl font-bold">
          {ccCredit ? "Credit card credit" : cheque ? "Write cheque" : "New expense"}
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
              <Label>Payee (vendor)</Label>
              <Select
                value={form.vendorId}
                onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))}
              >
                <option value="">— none —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                {ccCredit ? "Credit card *" : cheque ? "Bank account *" : "Paid from *"}
              </Label>
              <Select
                value={form.paymentAccountId}
                onChange={(e) => setForm((f) => ({ ...f, paymentAccountId: e.target.value }))}
                required
              >
                <option value="">Select account…</option>
                {payFrom.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{cheque ? "Reference" : "Expense no."} *</Label>
              <Input
                value={form.number}
                onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                required
              />
            </div>
            {cheque ? (
              <div className="space-y-2">
                <Label>Cheque no.</Label>
                <Input
                  value={form.refNumber}
                  onChange={(e) => setForm((f) => ({ ...f, refNumber: e.target.value }))}
                  placeholder="1042"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Ref / receipt no.</Label>
                <Input
                  value={form.refNumber}
                  onChange={(e) => setForm((f) => ({ ...f, refNumber: e.target.value }))}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
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
              <CardTitle>Category details</CardTitle>
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
            <Link href="/expenses">Cancel</Link>
          </Button>
          <Button type="submit" disabled={save.isPending || !valid}>
            {save.isPending
              ? "Saving…"
              : ccCredit
                ? "Record credit"
                : cheque
                  ? "Record cheque"
                  : "Record expense"}
          </Button>
        </div>
      </form>
    </>
  );
}
