"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

function Inner({
  children,
  variant,
  pendingLabel,
}: {
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? pendingLabel ?? "Working…" : children}
    </Button>
  );
}

/** A form wrapping a bound server action, with optional confirm() guard. */
export function ActionButton({
  action,
  children,
  variant,
  confirmText,
  pendingLabel,
}: {
  action: () => void;
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  confirmText?: string;
  pendingLabel?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault();
      }}
    >
      <Inner variant={variant} pendingLabel={pendingLabel}>
        {children}
      </Inner>
    </form>
  );
}
