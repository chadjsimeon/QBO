"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { BankFormState } from "@/app/(app)/banking/actions";
import type { MatchCandidate } from "@/lib/banking";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Matching…" : "Match selected"}
    </Button>
  );
}

export function MatchPanel({
  action,
  candidates,
}: {
  action: (prev: BankFormState, formData: FormData) => Promise<BankFormState>;
  candidates: MatchCandidate[];
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Found {candidates.length} existing ledger entr{candidates.length === 1 ? "y" : "ies"} with a
        matching amount:
      </p>
      <div className="space-y-1">
        {candidates.map((c, i) => (
          <label
            key={c.journalEntryId}
            className="flex cursor-pointer items-center gap-3 rounded-sm border bg-background px-3 py-2 text-sm"
          >
            <input
              type="radio"
              name="journalEntryId"
              value={c.journalEntryId}
              defaultChecked={i === 0}
            />
            <span className="flex-1">
              <span className="text-muted-foreground">{formatDate(c.date)}</span>{" "}
              {c.memo ?? c.sourceType}
            </span>
            <span className="tabular-nums">{formatCents(c.amountCents)}</span>
          </label>
        ))}
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <Submit />
    </form>
  );
}
