import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListVendors, useListAccounts, useListTaxRates } from "@workspace/api-client-react";
import { ArrowLeft } from "lucide-react";
import { apiFetch, toDateInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineItemsEditor } from "@/components/line-items-editor";
import { useLineItems } from "@/hooks/use-line-items";
import { nextDocNumber } from "@/hooks/use-next-doc-number";
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

export default function VendorCreditFormPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    vendorId: "",
    number: "",
    date: toDateInput(new Date()),
    memo: "",
  });
  const { lines, updateLine, addLine, removeLine, subtotalCents } = useLineItems(
    EMPTY,
    (l) => l.quantity * l.unitPriceCents,
  );

  const { data: vendors = [] } = useListVendors();
  const { data: accounts = [] } = useListAccounts();
  const { data: taxRates = [] } = useListTaxRates();
  const { data: count } = useQuery({
    queryKey: ["vendor-credits"],
    queryFn: () => apiFetch<unknown[]>("/vendor-credits"),
    select: (d: unknown[]) => d.length,
  });
  useEffect(() => {
    if (count !== undefined && !form.number)
      setForm((f) => ({ ...f, number: nextDocNumber("VC", count) }));
  }, [count]);

  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE");
  const valid =
    form.vendorId && subtotalCents > 0 && lines.every((l) => l.accountId && l.description);

  const save = useMutation({
    mutationFn: () =>
      apiFetch("/vendor-credits", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          lines: lines.map((l) => ({ ...l, taxRateId: l.taxRateId || undefined })),
        }),
      }),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["vendor-credits"] });
      toast({ title: "Supplier credit created" });
      navigate(`/vendor-credits/${d.id}`);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="mb-6">
        <Link
          href="/vendor-credits"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to supplier credits
        </Link>
        <h1 className="text-2xl font-bold">New supplier credit</h1>
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
            <div className="space-y-2">
              <Label>Memo</Label>
              <Input
                value={form.memo}
                onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>
        <LineItemsEditor
          title="Category details"
          lines={lines}
          addLine={addLine}
          removeLine={removeLine}
          subtotalCents={subtotalCents}
          renderRow={(line, i) => (
            <>
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
            </>
          )}
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <Link href="/vendor-credits">Cancel</Link>
          </Button>
          <Button type="submit" disabled={save.isPending || !valid}>
            {save.isPending ? "Saving…" : "Create supplier credit"}
          </Button>
        </div>
      </form>
    </>
  );
}
