"use client";

import { useState } from "react";
import { ChevronDown, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { RangeKpis } from "@/lib/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type Metric = "income" | "expenses" | "net";

const FIELD: Record<Metric, "incomeCents" | "expensesCents" | "netCents"> = {
  income: "incomeCents",
  expenses: "expensesCents",
  net: "netCents",
};

export function KpiTile({
  label,
  metric,
  data,
  goodWhenUp,
}: {
  label: string;
  metric: Metric;
  data: RangeKpis[];
  goodWhenUp: boolean;
}) {
  const [rangeKey, setRangeKey] = useState(data[2]?.key ?? data[0]?.key);
  const selected = data.find((d) => d.key === rangeKey) ?? data[0];
  const field = FIELD[metric];
  const value = selected[field];
  const prior = selected.prior[field];

  const delta = prior !== 0 ? ((value - prior) / Math.abs(prior)) * 100 : null;
  const up = value >= prior;
  const positive = goodWhenUp ? up : !up;

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Dropdown
            align="end"
            trigger={
              <button
                type="button"
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
              >
                {selected.label} <ChevronDown className="h-3 w-3" />
              </button>
            }
          >
            {data.map((d) => (
              <DropdownItem key={d.key} onClick={() => setRangeKey(d.key)}>
                {d.label}
              </DropdownItem>
            ))}
          </Dropdown>
        </div>

        <div className="mt-1 text-2xl font-bold tabular-nums">{formatCents(value)}</div>

        {delta !== null ? (
          <div
            className={cn(
              "mt-1 flex items-center gap-1 text-xs font-medium",
              positive ? "text-green-700" : "text-destructive"
            )}
          >
            {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(delta).toFixed(0)}% from prior period
          </div>
        ) : (
          <div className="mt-1 text-xs text-muted-foreground">No prior-period data</div>
        )}
      </CardContent>
    </Card>
  );
}
