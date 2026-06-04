"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatCents } from "@/lib/money";

export type FormState = { error?: string; fieldErrors?: Record<string, string> };

export interface ContactOption {
  id: string;
  name: string;
}
export interface AccountOption {
  id: string;
  code: string;
  name: string;
}
export interface TaxOption {
  id: string;
  name: string;
  rateBps: number;
}

export interface LineRow {
  description: string;
  quantity: number;
  unitPrice: string; // dollars, as entered
  accountId: string;
  taxRateId: string;
}

export interface DocumentDefaults {
  contactId?: string;
  number?: string;
  issueDate?: string;
  dueDate?: string;
  lines?: LineRow[];
}

const emptyRow = (accountId: string): LineRow => ({
  description: "",
  quantity: 1,
  unitPrice: "0.00",
  accountId,
  taxRateId: "",
});

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function DocumentForm({
  action,
  contactLabel,
  contacts,
  accounts,
  taxRates,
  defaults,
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  contactLabel: string;
  contacts: ContactOption[];
  accounts: AccountOption[];
  taxRates: TaxOption[];
  defaults?: DocumentDefaults;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const firstAccount = accounts[0]?.id ?? "";
  const [rows, setRows] = useState<LineRow[]>(
    defaults?.lines?.length ? defaults.lines : [emptyRow(firstAccount)]
  );

  const update = (i: number, patch: Partial<LineRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow(firstAccount)]);
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));

  const rateById = new Map(taxRates.map((t) => [t.id, t.rateBps]));
  const lineCents = (r: LineRow) => {
    const cents = Math.round((parseFloat(r.unitPrice || "0") || 0) * 100);
    return (r.quantity || 0) * cents;
  };
  const lineTax = (r: LineRow) => {
    const rate = r.taxRateId ? rateById.get(r.taxRateId) ?? 0 : 0;
    return Math.round((lineCents(r) * rate) / 10000);
  };
  const subtotal = rows.reduce((s, r) => s + lineCents(r), 0);
  const tax = rows.reduce((s, r) => s + lineTax(r), 0);
  const total = subtotal + tax;

  // Strip the display-only fields the server doesn't need; it recomputes money.
  const linesPayload = JSON.stringify(
    rows.map((r) => ({
      description: r.description,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      accountId: r.accountId,
      taxRateId: r.taxRateId || null,
    }))
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="lines" value={linesPayload} />

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="contactId">{contactLabel}</Label>
            <Select id="contactId" name="contactId" defaultValue={defaults?.contactId ?? ""} required>
              <option value="" disabled>
                Select {contactLabel.toLowerCase()}…
              </option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="number">Number</Label>
            <Input id="number" name="number" defaultValue={defaults?.number ?? ""} required />
            {state.fieldErrors?.number && (
              <p className="text-sm text-destructive">{state.fieldErrors.number}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="issueDate">Issue date</Label>
            <Input id="issueDate" name="issueDate" type="date" defaultValue={defaults?.issueDate ?? ""} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dueDate">Due date</Label>
            <Input id="dueDate" name="dueDate" type="date" defaultValue={defaults?.dueDate ?? ""} required />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-2 grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground">
            <div className="col-span-4">Description</div>
            <div className="col-span-3">Account</div>
            <div className="col-span-1 text-right">Qty</div>
            <div className="col-span-1 text-right">Price</div>
            <div className="col-span-2">Tax</div>
            <div className="col-span-1 text-right">Amount</div>
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2">
                <Input
                  className="col-span-4"
                  placeholder="Description"
                  value={r.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                />
                <Select
                  className="col-span-3"
                  value={r.accountId}
                  onChange={(e) => update(i, { accountId: e.target.value })}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </Select>
                <Input
                  className="col-span-1 text-right"
                  type="number"
                  min={1}
                  value={r.quantity}
                  onChange={(e) => update(i, { quantity: parseInt(e.target.value || "0", 10) })}
                />
                <Input
                  className="col-span-1 text-right"
                  type="number"
                  step="0.01"
                  min={0}
                  value={r.unitPrice}
                  onChange={(e) => update(i, { unitPrice: e.target.value })}
                />
                <Select
                  className="col-span-2"
                  value={r.taxRateId}
                  onChange={(e) => update(i, { taxRateId: e.target.value })}
                >
                  <option value="">No tax</option>
                  {taxRates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                <div className="col-span-1 flex items-center justify-end gap-1 text-right text-sm tabular-nums">
                  {formatCents(lineCents(r))}
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Remove line"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addRow}>
            <Plus className="h-4 w-4" /> Add line
          </Button>

          <div className="mt-6 ml-auto w-64 space-y-1 text-sm">
            <Row label="Subtotal" value={formatCents(subtotal)} />
            <Row label="Tax" value={formatCents(tax)} />
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCents(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Submit label={submitLabel} />
        <Button type="button" variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
