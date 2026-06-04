"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CashFlowPoint } from "@/lib/dashboard";
import { formatCents } from "@/lib/money";

export function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  const hasData = data.some((d) => d.inflowCents !== 0 || d.outflowCents !== 0);
  if (!hasData) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No cash movement in this period yet.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    month: d.month,
    Inflow: d.inflowCents / 100,
    Outflow: d.outflowCents / 100,
    Net: d.netCents / 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={12}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip formatter={(v: number) => formatCents(Math.round(v * 100))} />
        <Legend />
        <Bar dataKey="Inflow" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Bar dataKey="Outflow" fill="#fb7185" radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Line dataKey="Net" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
