import { useQuery } from "@tanstack/react-query";
import { Wallet, FileText, Receipt } from "lucide-react";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">{user?.organizationName}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Cash on hand</span>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold tabular-nums">{data ? formatCents(data.cashCents) : "—"}</div>
          </CardContent>
        </Card>
        <Link href="/invoices">
          <Card className="cursor-pointer transition-colors hover:border-foreground/30">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">Outstanding receivables</span>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold tabular-nums">{data ? formatCents(data.arOpenCents) : "—"}</div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/bills">
          <Card className="cursor-pointer transition-colors hover:border-foreground/30">
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">Outstanding payables</span>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold tabular-nums">{data ? formatCents(data.apOpenCents) : "—"}</div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent ledger activity</CardTitle>
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
                  <Badge variant="secondary" className="capitalize text-xs">
                    {e.sourceType.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
