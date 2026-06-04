"use client";

export function ClearedCheckbox({
  action,
  checked,
}: {
  action: () => void;
  checked: boolean;
}) {
  return (
    <form action={action}>
      <input
        type="checkbox"
        defaultChecked={checked}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-4 w-4 cursor-pointer"
        aria-label="Cleared"
      />
    </form>
  );
}
