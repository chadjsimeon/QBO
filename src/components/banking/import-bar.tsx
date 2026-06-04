"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Upload, Plus, Sparkles } from "lucide-react";
import type { BankFormState } from "@/app/(app)/banking/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function Pending({ label, idle }: { label: string; idle: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? label : idle}
    </Button>
  );
}

export function ImportBar({
  importAction,
  sampleAction,
  manualAction,
  today,
}: {
  importAction: (prev: BankFormState, formData: FormData) => Promise<BankFormState>;
  sampleAction: () => void;
  manualAction: (prev: BankFormState, formData: FormData) => Promise<BankFormState>;
  today: string;
}) {
  const [mode, setMode] = useState<"none" | "csv" | "manual">("none");
  const [csvState, csvFormAction] = useActionState(importAction, {});
  const [manualState, manualFormAction] = useActionState(manualAction, {});

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={mode === "csv" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode((m) => (m === "csv" ? "none" : "csv"))}
        >
          <Upload className="h-4 w-4" /> Import CSV
        </Button>
        <Button
          variant={mode === "manual" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode((m) => (m === "manual" ? "none" : "manual"))}
        >
          <Plus className="h-4 w-4" /> Add transaction
        </Button>
        <form action={sampleAction}>
          <Button type="submit" variant="secondary" size="sm">
            <Sparkles className="h-4 w-4" /> Load sample
          </Button>
        </form>
      </div>

      {mode === "csv" && (
        <form action={csvFormAction} className="space-y-2 rounded-md border bg-muted/30 p-3">
          <Label className="text-xs">
            Paste rows as <code>date,description,amount</code> — positive = deposit, negative =
            money out.
          </Label>
          <Textarea
            name="csv"
            rows={4}
            placeholder={"2026-03-01,ACH DEPOSIT ACME,1500.00\n2026-03-02,AWS SERVICES,-95.00"}
            className="font-mono text-xs"
          />
          {csvState.error && <p className="text-xs text-destructive">{csvState.error}</p>}
          <Pending label="Importing…" idle="Import" />
        </form>
      )}

      {mode === "manual" && (
        <form action={manualFormAction} className="grid grid-cols-5 items-end gap-2 rounded-md border bg-muted/30 p-3">
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input name="date" type="date" defaultValue={today} required />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Description</Label>
            <Input name="description" placeholder="Description" required />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Direction</Label>
            <Select name="direction" defaultValue="OUT">
              <option value="IN">Money in</option>
              <option value="OUT">Money out</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount</Label>
            <Input name="amount" type="number" step="0.01" min={0} placeholder="0.00" required />
          </div>
          {manualState.error && (
            <p className="col-span-5 text-xs text-destructive">{manualState.error}</p>
          )}
          <div className="col-span-5">
            <Pending label="Adding…" idle="Add transaction" />
          </div>
        </form>
      )}
    </div>
  );
}
