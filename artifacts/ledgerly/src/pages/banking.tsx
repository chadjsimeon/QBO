import { useQuery } from "@tanstack/react-query";
import { Landmark, Upload } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, formatCents } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";

interface BankAccount {
  id: string; accountId: string; accountName: string | null;
  institutionName: string; accountMask: string | null;
  bankBalanceCents: number; isActive: boolean; createdAt: string;
}

export default function BankingPage() {
  const { data: accounts = [] } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => apiFetch<BankAccount[]>("/bank-accounts"),
  });

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Banking</h1>
          <p className="text-sm text-muted-foreground">Connected bank accounts and transaction reconciliation.</p>
        </div>
        <Link href="/banking/import"><Button><Upload className="h-4 w-4 mr-1" /> Import transactions</Button></Link>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          title="No bank accounts connected"
          description="Link a bank account to import and categorize transactions."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map(ba => (
            <Card key={ba.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Landmark className="h-4 w-4 text-muted-foreground" />
                  {ba.institutionName}
                  {ba.accountMask && <span className="text-muted-foreground font-normal">···{ba.accountMask}</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">{formatCents(ba.bankBalanceCents)}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Linked GL account: {ba.accountName ?? "—"}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
