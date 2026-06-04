"use client";

import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function Inner({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="icon"
      disabled={pending}
      title={label}
      aria-label={label}
    >
      <Trash2 className="h-4 w-4 text-muted-foreground" />
    </Button>
  );
}

/**
 * Renders a form whose submit invokes a bound server action. The confirm()
 * guard runs before submission.
 */
export function DeleteButton({
  action,
  label = "Delete",
  confirmText = "Delete this item? This cannot be undone.",
}: {
  action: () => void;
  label?: string;
  confirmText?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      <Inner label={label} />
    </form>
  );
}
