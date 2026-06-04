import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  TrendingUp, TrendingDown, FileText, DollarSign, Landmark, ArrowRight,
  Lightbulb, ReceiptText, Clock, Newspaper,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { apiFetch, formatCents } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface HomeData {
  profitLoss: {
    incomeCents: number;
    expensesCents: number;
    netProfitCents: number;
    priorNetProfitCents: number;
    changePercent: number;
  };
  expenses: {
    totalCents: number;
    priorTotalCents: number;
    changePercent: number;
    byCategory: Array<{ name: string; amountCents: number }>;
  };
  bankAccounts: Array<{ id: string; name: string; code: string; balanceCents: number }>;
  cashFlow: Array<{ month: string; inCents: number; outCents: number }>;
  arOpenCents: number;
  apOpenCents: number;
  recentFeed: Array<{ id: string; date: string; memo: string | null; sourceType: string }>;
}

const PIE_COLORS = ["#22c55e", "#16a34a", "#15803d", "#166534", "#14532d", "#bbf7d0"];

const MODULES = [
  { label: "Accounting", icon: "📊", active: true },
  { label: "Expenses & Pay Bills", icon: "💸" },
  { label: "Sales & Get Paid", icon: "💰" },
  { label: "Customer Hub", icon: "👥" },
  { label: "Team", icon: "🤝" },
  { label: "Tax", icon: "📋" },
  { label: "Marketing", icon: "📣" },
];

const QUICK_ACTIONS = [
  { label: "Create invoice", href: "/invoices/new", icon: FileText },
  { label: "Record expense", href: "/bills/new", icon: ReceiptText },
  { label: "Bank deposit", href: "/banking", icon: Landmark },
  { label: "Receive payment", href: "/payments/new", icon: DollarSign },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function ChangeChip({ pct }: { pct: number }) {
  if (pct === 0) return null;
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? "text-emerald-600" : "text-red-500"}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{pct}%
    </span>
  );
}

function PnlBar({ label, amountCents, maxCents, color }: { label: string; amountCents: number; maxCents: number; color: string }) {
  const pct = maxCents > 0 ? Math.min(100, (amountCents / maxCents) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{formatCents(amountCents)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

const customPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, name }: any) => {
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600}>
      {name.length > 10 ? name.slice(0, 8) + "…" : name}
    </text>
  );
};

function formatCentsCompact(c: number) {
  if (Math.abs(c) >= 100000) return `$${(c / 100000).toFixed(1)}k`;
  return `$${(c / 100).toFixed(0)}`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<HomeData>({
    queryKey: ["home"],
    queryFn: () => apiFetch<HomeData>("/dashboard/home"),
  });

  const maxPnl = Math.max(data?.profitLoss.incomeCents ?? 0, data?.profitLoss.expensesCents ?? 0);

  const cashFlowData = data?.cashFlow.map(m => ({
    month: m.month,
    In: Math.round(m.inCents / 100),
    Out: Math.round(m.outCents / 100),
  })) ?? [];

  const totalBankBalance = data?.bankAccounts.reduce((s, a) => s + a.balanceCents, 0) ?? 0;

  return (
    <div className="space-y-6">

      {/* ── Greeting + Module tabs ── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting()}, {user?.organizationName ?? "there"}!
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Here's what's happening with your business today.</p>
      </div>

      {/* Module tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {MODULES.map(m => (
          <button
            key={m.label}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors border ${
              m.active
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            }`}
          >
            <span>{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Row 1: Business Feed + Create Actions ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Business Feed */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Business Feed</CardTitle>
            </div>
            <Link href="/reports" className="text-xs text-primary hover:underline font-medium">View all</Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />)}
              </div>
            ) : !data?.recentFeed?.length ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Nothing new right now.</p>
                <p className="text-xs text-muted-foreground mt-1">Check back soon!</p>
              </div>
            ) : (
              <ul className="divide-y">
                {data.recentFeed.map(e => {
                  const label = e.memo || e.sourceType.replace(/_/g, " ");
                  const d = new Date(e.date);
                  return (
                    <li key={e.id} className="flex items-center justify-between py-2.5 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{label}</p>
                        <p className="text-xs text-muted-foreground">{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                      </div>
                      <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full whitespace-nowrap">
                        {e.sourceType.replace(/_/g, " ")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Create actions */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Create actions</CardTitle>
            <button
              onClick={() => {
                const btn = document.querySelector<HTMLButtonElement>("[data-create-menu]");
                btn?.click();
              }}
              className="text-xs text-primary hover:underline font-medium"
            >
              Show all
            </button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2.5">
              {QUICK_ACTIONS.map(a => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.label}
                    onClick={() => navigate(a.href)}
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm font-medium hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-colors text-left"
                  >
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    {a.label}
                  </button>
                );
              })}
            </div>

            {/* AR / AP mini-summary */}
            <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Outstanding AR</p>
                <p className="text-base font-bold tabular-nums text-blue-600">
                  {data ? formatCents(data.arOpenCents) : "—"}
                </p>
                <Link href="/invoices" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5 mt-0.5">
                  View invoices <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Outstanding AP</p>
                <p className="text-base font-bold tabular-nums text-amber-600">
                  {data ? formatCents(data.apOpenCents) : "—"}
                </p>
                <Link href="/bills" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5 mt-0.5">
                  View bills <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 2: Business at a Glance (4 widgets) ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Business at a glance</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

          {/* P&L */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Profit &amp; Loss</CardTitle>
                <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">Last month</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="space-y-2">
                  <div className="h-8 bg-muted rounded animate-pulse" />
                  <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
                </div>
              ) : (
                <>
                  <div>
                    <div className="text-2xl font-bold tabular-nums">
                      {data ? formatCents(data.profitLoss.netProfitCents) : "—"}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {data && <ChangeChip pct={data.profitLoss.changePercent} />}
                      <span className="text-xs text-muted-foreground">from prior month</span>
                    </div>
                  </div>
                  <div className="space-y-2 pt-1">
                    <PnlBar label="Income" amountCents={data?.profitLoss.incomeCents ?? 0} maxCents={maxPnl} color="#22c55e" />
                    <PnlBar label="Expenses" amountCents={data?.profitLoss.expensesCents ?? 0} maxCents={maxPnl} color="#f59e0b" />
                  </div>
                  <Link href="/reports" className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline">
                    Analyze profit &amp; loss <ArrowRight className="h-3 w-3" />
                  </Link>
                </>
              )}
            </CardContent>
          </Card>

          {/* Expenses */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Expenses</CardTitle>
                <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">Last 30 days</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="h-32 bg-muted rounded animate-pulse" />
              ) : (
                <>
                  <div>
                    <div className="text-2xl font-bold tabular-nums">
                      {data ? formatCents(data.expenses.totalCents) : "—"}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {data && <ChangeChip pct={data.expenses.changePercent} />}
                      <span className="text-xs text-muted-foreground">from prior 30 days</span>
                    </div>
                  </div>

                  {data?.expenses.byCategory.length ? (
                    <div className="h-24">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.expenses.byCategory}
                            dataKey="amountCents"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={42}
                            labelLine={false}
                          >
                            {data.expenses.byCategory.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v: number) => formatCents(v)}
                            contentStyle={{ fontSize: 11, borderRadius: 6 }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">No expense data</div>
                  )}

                  <Link href="/bills" className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline">
                    View all spending <ArrowRight className="h-3 w-3" />
                  </Link>
                </>
              )}
            </CardContent>
          </Card>

          {/* Smart Suggestions */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                <CardTitle className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Smart suggestions</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-9 bg-muted rounded animate-pulse" />)}
                </div>
              ) : (
                <>
                  {data && data.arOpenCents > 0 && (
                    <button
                      onClick={() => navigate("/invoices")}
                      className="w-full text-left rounded-lg border border-border px-3 py-2.5 hover:bg-muted/50 hover:border-primary/30 transition-colors group"
                    >
                      <p className="text-xs font-semibold text-foreground group-hover:text-primary">Collect overdue AR</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatCents(data.arOpenCents)} outstanding</p>
                    </button>
                  )}
                  {data && data.apOpenCents > 0 && (
                    <button
                      onClick={() => navigate("/bills")}
                      className="w-full text-left rounded-lg border border-border px-3 py-2.5 hover:bg-muted/50 hover:border-primary/30 transition-colors group"
                    >
                      <p className="text-xs font-semibold text-foreground group-hover:text-primary">Pay outstanding bills</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatCents(data.apOpenCents)} due</p>
                    </button>
                  )}
                  <button
                    onClick={() => navigate("/reports")}
                    className="w-full text-left rounded-lg border border-border px-3 py-2.5 hover:bg-muted/50 hover:border-primary/30 transition-colors group"
                  >
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary">View profit &amp; loss</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Analyze monthly performance</p>
                  </button>
                  <button
                    onClick={() => navigate("/banking")}
                    className="w-full text-left rounded-lg border border-border px-3 py-2.5 hover:bg-muted/50 hover:border-primary/30 transition-colors group"
                  >
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary">Review bank transactions</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Reconcile accounts</p>
                  </button>
                  <p className="text-[10px] text-muted-foreground/60 pt-1">
                    Suggestions based on your current activity.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Bank Accounts */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Bank Accounts</CardTitle>
                <span className="text-[10px] text-muted-foreground">As of today</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2].map(i => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
                </div>
              ) : (
                <>
                  <div className="text-2xl font-bold tabular-nums">
                    {formatCents(totalBankBalance)}
                  </div>

                  {!data?.bankAccounts.length ? (
                    <p className="text-xs text-muted-foreground">No bank accounts linked.</p>
                  ) : (
                    <div className="space-y-2">
                      {data.bankAccounts.map(acct => (
                        <div key={acct.id} className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{acct.name}</p>
                            <p className="text-[10px] text-muted-foreground">{acct.code}</p>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className="text-xs font-semibold tabular-nums">{formatCents(acct.balanceCents)}</p>
                            <div className="inline-flex items-center gap-0.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              <span className="text-[10px] text-muted-foreground">Reviewed</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Link href="/banking" className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline">
                    Manage accounts <ArrowRight className="h-3 w-3" />
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Row 3: Cash Flow (full width) ── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Cash Flow</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Track how your money is doing</p>
            </div>
            <Link href="/banking" className="text-xs text-primary hover:underline font-medium">Link bank account</Link>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-48 bg-muted rounded animate-pulse" />
          ) : !cashFlowData.some(m => m.In > 0 || m.Out > 0) ? (
            <div className="h-48 flex flex-col items-center justify-center text-center">
              <Landmark className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No cash flow data yet</p>
              <p className="text-xs text-muted-foreground mt-1">Record payments to see your cash flow trend</p>
            </div>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashFlowData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                    width={44}
                  />
                  <Tooltip
                    formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                  />
                  <Area type="monotone" dataKey="In" name="Money in" stroke="#22c55e" strokeWidth={2} fill="url(#gradIn)" dot={false} />
                  <Area type="monotone" dataKey="Out" name="Money out" stroke="#f59e0b" strokeWidth={2} fill="url(#gradOut)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Legend */}
          {!isLoading && cashFlowData.some(m => m.In > 0 || m.Out > 0) && (
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-5 rounded-full bg-emerald-500 inline-block" />
                Money in
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-5 rounded-full bg-amber-400 inline-block" />
                Money out
              </div>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
