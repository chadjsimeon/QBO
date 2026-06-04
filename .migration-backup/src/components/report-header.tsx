import { PrintButton } from "@/components/print-button";

/**
 * Standard report masthead: title, org, accrual-basis label, the period it
 * covers, and a generated-at timestamp — matching QBO's report chrome.
 */
export function ReportHeader({
  title,
  organizationName,
  periodLabel,
  basis = "Accrual Basis",
}: {
  title: string;
  organizationName: string;
  periodLabel: string;
  basis?: string;
}) {
  const generated = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <div className="text-lg font-semibold">{organizationName}</div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <div className="mt-1 text-sm text-muted-foreground">{periodLabel}</div>
        <div className="text-xs text-muted-foreground">
          {basis} · Generated {generated}
        </div>
      </div>
      <PrintButton />
    </div>
  );
}
