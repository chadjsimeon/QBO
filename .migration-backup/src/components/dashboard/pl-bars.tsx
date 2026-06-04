import { formatCents } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** QBO-style Profit & Loss tile: net profit on top, income/expense bars below. */
export function PlBars({
  incomeCents,
  expensesCents,
  periodLabel,
}: {
  incomeCents: number;
  expensesCents: number;
  periodLabel: string;
}) {
  const net = incomeCents - expensesCents;
  const max = Math.max(incomeCents, expensesCents, 1);
  const incomePct = (incomeCents / max) * 100;
  const expensePct = (expensesCents / max) * 100;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Profit &amp; Loss</CardTitle>
        <p className="text-xs text-muted-foreground">{periodLabel}</p>
      </CardHeader>
      <CardContent>
        <div className="mb-1 text-xs text-muted-foreground">Net profit</div>
        <div className="mb-5 text-3xl font-bold tabular-nums">{formatCents(net)}</div>

        <Bar label="Income" valueCents={incomeCents} pct={incomePct} color="bg-green-500" />
        <div className="h-3" />
        <Bar label="Expenses" valueCents={expensesCents} pct={expensePct} color="bg-rose-400" />
      </CardContent>
    </Card>
  );
}

function Bar({
  label,
  valueCents,
  pct,
  color,
}: {
  label: string;
  valueCents: number;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{formatCents(valueCents)}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
