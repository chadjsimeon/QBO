"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  startReconciliation,
  type ReconcileFormState,
} from "@/app/(app)/banking/reconcile-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Starting…" : "Start reconciling"}
    </Button>
  );
}

export function StartReconcileForm({
  bankAccountId,
  defaultDate,
  defaultBalance,
}: {
  bankAccountId: string;
  defaultDate: string;
  defaultBalance: string;
}) {
  const action = startReconciliation.bind(null, bankAccountId);
  const [state, formAction] = useActionState<ReconcileFormState, FormData>(action, {});

  return (
    <form action={formAction} className="grid max-w-md grid-cols-2 items-end gap-4">
      <div className="space-y-1">
        <Label className="text-xs">Statement ending date</Label>
        <Input name="statementDate" type="date" defaultValue={defaultDate} required />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Statement ending balance</Label>
        <Input name="statementBalance" type="number" step="0.01" defaultValue={defaultBalance} required />
      </div>
      <div className="col-span-2">
        <Submit />
        {state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
      </div>
    </form>
  );
}
