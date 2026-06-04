import { formatCents } from "@/lib/money";
import type { ReportSection } from "@/lib/reports";
import { cn } from "@/lib/utils";

/**
 * Renders a report section as a nested account tree. Parent accounts are bold
 * and show their subtotal (own + descendants); leaves show their own amount.
 * A bold section total closes it out.
 */
export function ReportSectionTable({
  title,
  section,
  totalLabel,
}: {
  title: string;
  section: ReportSection;
  totalLabel: string;
}) {
  return (
    <div className="mb-6">
      <div className="mb-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="divide-y divide-border/50">
        {section.rows.length === 0 ? (
          <div className="py-2 text-sm text-muted-foreground">No activity.</div>
        ) : (
          section.rows.map((row) => (
            <div
              key={row.account.id}
              className={cn(
                "flex items-center justify-between py-1.5 text-sm",
                row.isParent && "font-semibold"
              )}
            >
              <span style={{ paddingLeft: row.depth * 20 }}>
                <span className="font-mono text-xs text-muted-foreground">
                  {row.account.code}
                </span>{" "}
                {row.account.name}
              </span>
              <span className="tabular-nums">{formatCents(row.amountCents)}</span>
            </div>
          ))
        )}
      </div>
      <div className="mt-1 flex items-center justify-between border-t-2 border-foreground/70 py-1.5 text-sm font-bold">
        <span>{totalLabel}</span>
        <span className="tabular-nums">{formatCents(section.totalCents)}</span>
      </div>
    </div>
  );
}
