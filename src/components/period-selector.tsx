import Link from "next/link";
import type { PeriodPreset } from "@prisma/client";
import { PRESET_OPTIONS } from "@/lib/report-periods";
import { cn } from "@/lib/utils";

/** Preset period links (GET navigation) shown above a report. */
export function PeriodSelector({
  basePath,
  active,
  extraParams = {},
}: {
  basePath: string;
  active: PeriodPreset;
  extraParams?: Record<string, string>;
}) {
  const qs = (preset: string) => {
    const params = new URLSearchParams({ ...extraParams, preset });
    return `${basePath}?${params.toString()}`;
  };
  return (
    <div className="no-print mb-4 flex flex-wrap gap-1">
      {PRESET_OPTIONS.map((opt) => (
        <Link
          key={opt.value}
          href={qs(opt.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            active === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}
