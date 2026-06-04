"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import type { BankFormState } from "@/app/(app)/banking/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatCents } from "@/lib/money";

export interface AccountOption {
  id: string;
  code: string;
  name: string;
}
export interface PayeeOption {
  id: string;
  name: string;
}

interface SplitRow {
  accountId: string;
  amount: string;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Add"}
    </Button>
  );
}

export function CategorizePanel({
  action,
  accounts,
  payees,
  payeeFieldName,
  amountCents,
}: {
  action: (prev: BankFormState, formData: FormData) => Promise<BankFormState>;
  accounts: AccountOption[];
  payees: PayeeOption[];
  payeeFieldName: "payeeVendorId" | "payeeCustomerId";
  amountCents: number;
}) {
  const magnitude = Math.abs(amountCents);
  const [state, formAction] = useActionState(action, {});
  const [rows, setRows] = useState<SplitRow[]>([
    { accountId: accounts[0]?.id ?? "", amount: (magnitude / 100).toFixed(2) },
  ]);

  const update = (i: number, patch: Partial<SplitRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { accountId: accounts[0]?.id ?? "", amount: "0.00" }]);
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));

  const assignedCents = rows.reduce((s, r) => s + Math.round((parseFloat(r.amount) || 0) * 100), 0);
  const remaining = magnitude - assignedCents;
  const splitsJson = JSON.stringify(
    rows.map((r) => ({ accountId: r.accountId, amount: parseFloat(r.amount) || 0 }))
  );

  return (
    <form action={formAction} className="space-y-3 rounded-md border bg-muted/30 p-3">
      <input type="hidden" name="splits" value={splitsJson} />

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2">
            <Select
              className="col-span-7"
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
              className="col-span-4 text-right"
              type="number"
              step="0.01"
              min={0}
              value={r.amount}
              onChange={(e) => update(i, { amount: e.target.value })}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="col-span-1 text-muted-foreground hover:text-destructive"
              title="Remove split"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" /> Split
        </Button>
        <span className={remaining === 0 ? "text-muted-foreground" : "text-destructive"}>
          {remaining === 0 ? "Fully assigned" : `Remaining ${formatCents(remaining)}`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Payee (optional)</Label>
          <Select name={payeeFieldName} defaultValue="">
            <option value="">None</option>
            {payees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Memo (optional)</Label>
          <Input name="memo" placeholder="Memo" />
        </div>
      </div>

      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <Submit />
    </form>
  );
}
