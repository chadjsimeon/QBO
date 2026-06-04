import { useQuery } from "@tanstack/react-query";
import { Wallet, FileText, Receipt, ArrowRight } from "lucide-react";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Link } from "wouter";

interface DashboardSummary {
  arOpenCents: number;
  apOpenCents: number;
  cashCents: number;
  recentEntries: Array<{ id: string; date: string; memo: string | null; sourceType: string }>;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<DashboardSummary>("/dashboard/summary"),
  });

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">{user?.organizationName}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Cash on hand */}
        <Card className="border-l-4 border-l-emerald-500 shadow-md">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cash on hand</span>
              <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <Wallet className="h-4 w-4 text-emerald-600" />
              </div>
            </div>
            <div className="text-2xl font-bold tabular-nums">{data ? formatCents(data.cashCents) : "—"}</div>
          </CardContent>
        </Card>

        {/* Outstanding receivables */}
        <Card className="border-l-4 border-l-blue-500 shadow-md cursor-pointer hover:shadow-lg transition-shadow">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outstanding receivables</span>
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                <FileText className="h-4 w-4 text-blue-600" />
              </div>
            </div>
            <div className="text-2xl font-bold tabular-nums">{data ? formatCents(data.arOpenCents) : "—"}</div>
            <Link href="/invoices">
              <a className="mt-2 inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline">
                View invoices <ArrowRight className="h-3 w-3" />
              </a>
            </Link>
          </CardContent>
        </Card>

        {/* Outstanding payables */}
        <Card className="border-l-4 border-l-amber-500 shadow-md cursor-pointer hover:shadow-lg transition-shadow">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outstanding payables</span>
              <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
                <Receipt className="h-4 w-4 text-amber-600" />
              </div>
            </div>
            <div className="text-2xl font-bold tabular-nums">{data ? formatCents(data.apOpenCents) : "—"}</div>
            <Link href="/bills">
              <a className="mt-2 inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline">
                View bills <ArrowRight className="h-3 w-3" />
              </a>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Recent ledger activity</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.recentEntries?.length ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="divide-y">
              {data.recentEntries.map(e => (
                <li key={e.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <span className="text-muted-foreground mr-2">{formatDate(e.date)}</span>
                    <span>{e.memo ?? e.sourceType}</span>
                  </div>
                  <StatusBadge status={e.sourceType} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
