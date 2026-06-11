import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, formatCents, toDateInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
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
}
interface TaxRate {
  id: string;
  name: string;
  rateBps: number;
}
interface LineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  accountId: string;
  taxRateId: string;
}

const EMPTY_LINE: LineItem = {
  description: "",
  quantity: 1,
  unitPriceCents: 0,
  accountId: "",
  taxRateId: "",
};

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export default function BillFormPage() {
  const [, editParams] = useRoute("/bills/:id/edit");
  const [, navigate] = useLocation();
  const isEdit = !!editParams?.id;
  const editId = editParams?.id;
  const { toast } = useToast();
  const qc = useQueryClient();

  const today = new Date();
  const [form, setForm] = useState({
    contactId: "",
    number: "",
    issueDate: toDateInput(today),
    dueDate: toDateInput(addDays(today, 30)),
  });
  const [lines, setLines] = useState<LineItem[]>([{ ...EMPTY_LINE }]);

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
  const { data: billCount } = useQuery({
    queryKey: ["bills"],
    queryFn: () => apiFetch<unknown[]>("/bills"),
    select: (d: unknown[]) => d.length,
  });

  const { data: existing } = useQuery({
    queryKey: ["bill", editId],
    queryFn: () => apiFetch<any>(`/bills/${editId}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (!isEdit && billCount !== undefined && !form.number) {
      setForm((f) => ({ ...f, number: `BILL-${String(billCount + 1).padStart(4, "0")}` }));
    }
  }, [billCount, isEdit]);

  useEffect(() => {
    if (existing) {
      setForm({
        contactId: existing.vendorId,
        number: existing.number,
        issueDate: toDateInput(existing.issueDate),
        dueDate: toDateInput(existing.dueDate),
      });
      setLines(
        existing.lineItems.map((li: any) => ({
          description: li.description,
          quantity: li.quantity,
          unitPriceCents: li.unitPriceCents,
          accountId: li.accountId,
          taxRateId: li.taxRateId ?? "",
        })),
      );
    }
  }, [existing]);

  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE");

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        lines: lines.map((l) => ({ ...l, taxRateId: l.taxRateId || undefined })),
      };
      if (isEdit)
        return apiFetch(`/bills/${editId}`, { method: "PATCH", body: JSON.stringify(body) });
      return apiFetch("/bills", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      toast({ title: isEdit ? "Bill updated" : "Bill created" });
      navigate(`/bills/${data.id}`);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateLine = (i: number, field: keyof LineItem, value: string | number) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));

  const addLine = () => setLines((ls) => [...ls, { ...EMPTY_LINE }]);
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);

  if (vendors.length === 0) {
    return (
      <>
        <Link
          href="/bills"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to bills
        </Link>
        <EmptyState
          title="Add a vendor first"
          description="You need at least one vendor before creating a bill."
          action={
            <Link href="/vendors">
              <Button>Go to Vendors</Button>
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <div className="mb-6">
        <Link
          href={isEdit ? `/bills/${editId}` : "/bills"}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> {isEdit ? "Back to bill" : "Back to bills"}
        </Link>
        <h1 className="text-2xl font-bold">{isEdit ? "Edit bill" : "New bill"}</h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vendor">Vendor *</Label>
              <Select
                id="vendor"
                value={form.contactId}
                onChange={(e) => setForm((f) => ({ ...f, contactId: e.target.value }))}
                required
              >
                <option value="">Select vendor…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="number">Bill number *</Label>
              <Input
                id="number"
                value={form.number}
                onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="issueDate">Issue date *</Label>
              <Input
                id="issueDate"
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due date *</Label>
              <Input
                id="dueDate"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                required
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Line items</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
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
                    step={1}
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
                    step={1}
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
                    <option value="">Account…</option>
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
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i)}>
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
            <Link href={isEdit ? `/bills/${editId}` : "/bills"}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={saveMutation.isPending || !form.contactId}>
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </>
  );
}
