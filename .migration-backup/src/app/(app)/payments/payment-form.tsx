"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { recordPayment, type PaymentFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";

export interface OpenDoc {
  id: string;
  number: string;
  balanceCents: number;
  dueDate: string;
}
export interface ContactWithDocs {
  id: string;
  name: string;
  docs: OpenDoc[];
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Recording…" : "Record payment"}
    </Button>
  );
}

export function PaymentForm({
  customers,
  vendors,
  today,
}: {
  customers: ContactWithDocs[];
  vendors: ContactWithDocs[];
  today: string;
}) {
  const [state, formAction] = useActionState<PaymentFormState, FormData>(
    recordPayment,
    {}
  );
  const [direction, setDirection] = useState<"RECEIVED" | "SENT">("RECEIVED");
  const [contactId, setContactId] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const contacts = direction === "RECEIVED" ? customers : vendors;
  const contact = contacts.find((c) => c.id === contactId);
  const docs = contact?.docs ?? [];

  const allocations = useMemo(
    () =>
      docs
        .map((d) => ({ docId: d.id, amount: parseFloat(amounts[d.id] || "0") || 0 }))
        .filter((a) => a.amount > 0),
    [docs, amounts]
  );
  const totalCents = allocations.reduce(
    (s, a) => s + Math.round(a.amount * 100),
    0
  );

  const switchDirection = (dir: "RECEIVED" | "SENT") => {
    setDirection(dir);
    setContactId("");
    setAmounts({});
  };

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="contactId" value={contactId} />
      <input type="hidden" name="allocations" value={JSON.stringify(allocations)} />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={direction === "RECEIVED" ? "default" : "outline"}
              onClick={() => switchDirection("RECEIVED")}
            >
              Receive from customer
            </Button>
            <Button
              type="button"
              variant={direction === "SENT" ? "default" : "outline"}
              onClick={() => switchDirection("SENT")}
            >
              Pay a vendor
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact">
                {direction === "RECEIVED" ? "Customer" : "Vendor"}
              </Label>
              <Select
                id="contact"
                value={contactId}
                onChange={(e) => {
                  setContactId(e.target.value);
                  setAmounts({});
                }}
              >
                <option value="">Select…</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" defaultValue={today} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="method">Method</Label>
              <Select id="method" name="method" defaultValue="BANK_TRANSFER">
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CASH">Cash</option>
                <option value="CHECK">Check</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 text-sm font-medium">Apply to open documents</div>
          {!contact ? (
            <p className="text-sm text-muted-foreground">
              Select a {direction === "RECEIVED" ? "customer" : "vendor"} to see open{" "}
              {direction === "RECEIVED" ? "invoices" : "bills"}.
            </p>
          ) : docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open documents for this contact.</p>
          ) : (
            <div className="space-y-2">
              {docs.map((d) => (
                <div key={d.id} className="grid grid-cols-12 items-center gap-2 text-sm">
                  <div className="col-span-3 font-medium">{d.number}</div>
                  <div className="col-span-3 text-muted-foreground">Due {formatDate(d.dueDate)}</div>
                  <div className="col-span-3 text-right text-muted-foreground tabular-nums">
                    Balance {formatCents(d.balanceCents)}
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      max={d.balanceCents / 100}
                      placeholder="0.00"
                      value={amounts[d.id] ?? ""}
                      onChange={(e) =>
                        setAmounts((m) => ({ ...m, [d.id]: e.target.value }))
                      }
                    />
                  </div>
                </div>
              ))}
              <div className="flex justify-end border-t pt-3 text-sm font-semibold">
                <span className="mr-4">Payment total</span>
                <span className="tabular-nums">{formatCents(totalCents)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex gap-2">
        <Submit />
        <Button type="button" variant="outline" asChild>
          <Link href="/payments">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
