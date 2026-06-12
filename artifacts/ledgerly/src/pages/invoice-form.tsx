import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import {
  useListCustomers,
  useListAccounts,
  useListTaxRates,
  useListInvoices,
  useGetInvoice,
  useCreateInvoice,
  getUpdateInvoiceMutationOptions,
  getListInvoicesQueryKey,
  getGetInvoiceQueryKey,
  type DocumentInput,
} from "@workspace/api-client-react";
import { toDateInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { LineItemsEditor } from "@/components/line-items-editor";
import { useLineItems } from "@/hooks/use-line-items";
import { nextDocNumber } from "@/hooks/use-next-doc-number";
import { useToast } from "@/hooks/use-toast";

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

export default function InvoiceFormPage() {
  const [, editParams] = useRoute("/invoices/:id/edit");
  const [, navigate] = useLocation();
  const isEdit = !!editParams?.id;
  const editId = editParams?.id ?? "";
  const { toast } = useToast();
  const qc = useQueryClient();

  const today = new Date();
  const [form, setForm] = useState({
    contactId: "",
    number: "",
    issueDate: toDateInput(today),
    dueDate: toDateInput(addDays(today, 30)),
  });
  const { lines, setLines, updateLine, addLine, removeLine, subtotalCents } = useLineItems(
    EMPTY_LINE,
    (l) => l.quantity * l.unitPriceCents,
  );

  const { data: customers = [] } = useListCustomers();
  const { data: accounts = [] } = useListAccounts();
  const { data: taxRates = [] } = useListTaxRates();
  const { data: invoiceCount } = useListInvoices<number>({
    query: { select: (d) => d.length, queryKey: getListInvoicesQueryKey() },
  });
  const { data: existing } = useGetInvoice(editId, {
    query: { enabled: isEdit, queryKey: getGetInvoiceQueryKey(editId) },
  });

  useEffect(() => {
    if (!isEdit && invoiceCount !== undefined && !form.number) {
      setForm((f) => ({ ...f, number: nextDocNumber("INV", invoiceCount) }));
    }
  }, [invoiceCount, isEdit]);

  useEffect(() => {
    if (existing) {
      setForm({
        contactId: existing.customerId,
        number: existing.number,
        issueDate: toDateInput(existing.issueDate),
        dueDate: toDateInput(existing.dueDate),
      });
      setLines(
        existing.lineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unitPriceCents: li.unitPriceCents,
          accountId: li.accountId,
          taxRateId: li.taxRateId ?? "",
        })),
      );
    }
  }, [existing]);

  const incomeAccounts = accounts.filter((a) => a.type === "INCOME");

  const onSaved = (id: string) => {
    qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
    if (isEdit) qc.invalidateQueries({ queryKey: getGetInvoiceQueryKey(editId) });
    toast({ title: isEdit ? "Invoice updated" : "Invoice created" });
    navigate(`/invoices/${id}`);
  };
  const onError = (e: Error) =>
    toast({ title: "Error", description: e.message, variant: "destructive" });

  const createMutation = useCreateInvoice({
    mutation: { onSuccess: (d) => onSaved(d.id), onError },
  });
  const updateMutation = useMutation(
    getUpdateInvoiceMutationOptions({ mutation: { onSuccess: (d) => onSaved(d.id), onError } }),
  );

  const save = () => {
    const data: DocumentInput = {
      ...form,
      lines: lines.map((l) => ({ ...l, taxRateId: l.taxRateId || undefined })),
    };
    if (isEdit) updateMutation.mutate({ id: editId, data });
    else createMutation.mutate({ data });
  };
  const saving = createMutation.isPending || updateMutation.isPending;

  if (customers.length === 0) {
    return (
      <>
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to invoices
        </Link>
        <EmptyState
          title="Add a customer first"
          description="You need at least one customer before creating an invoice."
          action={
            <Link href="/customers">
              <Button>Go to Customers</Button>
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
          href={isEdit ? `/invoices/${editId}` : "/invoices"}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> {isEdit ? "Back to invoice" : "Back to invoices"}
        </Link>
        <h1 className="text-2xl font-bold">{isEdit ? "Edit invoice" : "New invoice"}</h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <Select
                id="customer"
                value={form.contactId}
                onChange={(e) => setForm((f) => ({ ...f, contactId: e.target.value }))}
                required
              >
                <option value="">Select customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="number">Invoice number *</Label>
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

        <LineItemsEditor
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
            </>
          )}
        />

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <Link href={isEdit ? `/invoices/${editId}` : "/invoices"}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={saving || !form.contactId}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
        </div>
      </form>
    </>
  );
}
