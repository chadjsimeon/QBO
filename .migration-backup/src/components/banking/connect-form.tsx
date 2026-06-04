"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createBankAccount, type BankFormState } from "@/app/(app)/banking/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Connecting…" : "Connect account"}
    </Button>
  );
}

export function ConnectForm({
  glAccounts,
}: {
  glAccounts: { id: string; code: string; name: string }[];
}) {
  const [state, formAction] = useActionState<BankFormState, FormData>(createBankAccount, {});

  if (glAccounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        All bank-type accounts are already connected. Add a new Bank account in the Chart of
        Accounts to connect another.
      </p>
    );
  }

  return (
    <form action={formAction} className="grid grid-cols-4 items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">GL account</Label>
        <Select name="accountId" defaultValue="" required>
          <option value="" disabled>
            Select…
          </option>
          {glAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Institution</Label>
        <Input name="institutionName" placeholder="First Demo Bank" required />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Last 4</Label>
        <Input name="accountMask" placeholder="4291" maxLength={4} />
      </div>
      <Submit />
      {state.error && <p className="col-span-4 text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
