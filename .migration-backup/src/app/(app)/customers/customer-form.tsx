"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import type { CustomerFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Values = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function CustomerForm({
  action,
  values,
  submitLabel,
}: {
  action: (
    prev: CustomerFormState,
    formData: FormData
  ) => Promise<CustomerFormState>;
  values?: Values;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const fe = state.fieldErrors ?? {};

  return (
    <Card className="max-w-xl">
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-4">
          <Field label="Name" name="name" defaultValue={values?.name} error={fe.name} required />
          <Field label="Email" name="email" type="email" defaultValue={values?.email ?? ""} error={fe.email} />
          <Field label="Phone" name="phone" defaultValue={values?.phone ?? ""} error={fe.phone} />
          <div className="space-y-2">
            <Label htmlFor="billingAddress">Billing address</Label>
            <Textarea id="billingAddress" name="billingAddress" defaultValue={values?.billingAddress ?? ""} />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <div className="flex gap-2">
            <Submit label={submitLabel} />
            <Button type="button" variant="outline" asChild>
              <Link href="/customers">Cancel</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  error,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} required={required} />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
