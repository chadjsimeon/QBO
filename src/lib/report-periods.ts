import type { PeriodPreset } from "@prisma/client";
import { formatDate } from "@/lib/dates";

export interface ResolvedPeriod {
  start: Date;
  end: Date;
  label: string;
  preset: PeriodPreset;
}

/** Resolve a preset (or explicit custom range) to concrete dates + a label. */
export function resolvePeriod(
  preset: PeriodPreset,
  today: Date = new Date(),
  custom?: { start?: string; end?: string }
): ResolvedPeriod {
  const y = today.getFullYear();
  const m = today.getMonth();

  const yearStart = new Date(Date.UTC(y, 0, 1));
  const yearEnd = new Date(Date.UTC(y, 11, 31));
  const monthStart = new Date(Date.UTC(y, m, 1));
  const monthEnd = new Date(Date.UTC(y, m + 1, 0));
  const lastMonthStart = new Date(Date.UTC(y, m - 1, 1));
  const lastMonthEnd = new Date(Date.UTC(y, m, 0));
  const todayUtc = new Date(Date.UTC(y, m, today.getDate()));

  switch (preset) {
    case "THIS_YEAR":
      return { start: yearStart, end: yearEnd, preset, label: `This year (${y})` };
    case "THIS_MONTH":
      return {
        start: monthStart,
        end: monthEnd,
        preset,
        label: `${formatDate(monthStart)} – ${formatDate(monthEnd)}`,
      };
    case "LAST_MONTH":
      return {
        start: lastMonthStart,
        end: lastMonthEnd,
        preset,
        label: `${formatDate(lastMonthStart)} – ${formatDate(lastMonthEnd)}`,
      };
    case "CUSTOM": {
      const start = custom?.start ? new Date(custom.start) : yearStart;
      const end = custom?.end ? new Date(custom.end) : todayUtc;
      return {
        start,
        end,
        preset,
        label: `${formatDate(start)} – ${formatDate(end)}`,
      };
    }
    case "THIS_YEAR_TO_DATE":
    default:
      return {
        start: yearStart,
        end: todayUtc,
        preset: "THIS_YEAR_TO_DATE",
        label: `Year to date — ${formatDate(todayUtc)}`,
      };
  }
}

export const PRESET_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "THIS_YEAR_TO_DATE", label: "Year to date" },
  { value: "THIS_YEAR", label: "This year" },
  { value: "THIS_MONTH", label: "This month" },
  { value: "LAST_MONTH", label: "Last month" },
];

export function parsePreset(value: string | undefined): PeriodPreset {
  const valid: PeriodPreset[] = [
    "THIS_YEAR",
    "THIS_YEAR_TO_DATE",
    "THIS_MONTH",
    "LAST_MONTH",
    "CUSTOM",
  ];
  return valid.includes(value as PeriodPreset)
    ? (value as PeriodPreset)
    : "THIS_YEAR_TO_DATE";
}
