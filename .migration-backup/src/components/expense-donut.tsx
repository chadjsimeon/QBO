"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCents } from "@/lib/money";

const COLORS = [
  "#2563eb", "#16a34a", "#db2777", "#d97706", "#7c3aed",
  "#0891b2", "#dc2626", "#65a30d", "#c026d3", "#0d9488",
];

export interface DonutSlice {
  name: string;
  valueCents: number;
}

export function ExpenseDonut({ data }: { data: DonutSlice[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        No expenses recorded yet.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="50%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="valueCents"
            nameKey="name"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [formatCents(value), name]}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-1 text-sm">
        {data.map((slice, i) => (
          <li key={slice.name} className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              {slice.name}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {formatCents(slice.valueCents)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
