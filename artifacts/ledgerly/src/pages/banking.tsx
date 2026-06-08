import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Landmark, Upload, Plus } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, formatCents } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";

interface BankAccount {
  id: string; accountId: string; accountName: string | null;
  institutionName: string; accountMask: string | null;
  bankBalanceCents: number; isActive: boolean; createdAt: string;
  forReviewCount: number; bookBalanceCents: number;
}

interface UnlinkedAccount {
  id: string; code: string; name: string; subtype: string;
}

export default function BankingPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => apiFetch<BankAccount[]>("/bank-accounts"),
  });

  const { data: unlinked = [] } = useQuery({
    queryKey: ["bank-accounts-unlinked"],
    queryFn: () => apiFetch<UnlinkedAccount[]>("/bank-accounts/unlinked"),
  });

  const connect = useMutation({
    mutationFn: (acct: UnlinkedAccount) =>
      apiFetch("/bank-accounts", {
        method: "POST",
        body: JSON.stringify({ accountId: acct.id, institutionName: acct.name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts-unlinked"] });
      toast({ title: "Account connected to Banking" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Banking</h1>
          <p className="text-sm text-muted-foreground">Connected bank accounts and transaction reconciliation.</p>
        </div>
        <Link href="/banking/import">
          <Button><Upload className="h-4 w-4 mr-1" /> Import transactions</Button>
        </Link>
      </div>

      {accounts.length === 0 && unlinked.length === 0 ? (
        <EmptyState
          title="No bank accounts connected"
          description="Create a bank account in Chart of Accounts to get started."
        />
      ) : null}

      {/* Connected accounts */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {accounts.map(ba => (
            <Link key={ba.id} href={`/banking/${ba.id}`}>
              <Card className="cursor-pointer transition-colors hover:border-primary/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Landmark className="h-4 w-4 text-muted-foreground" />
                    {ba.institutionName}
                    {ba.accountMask && (
                      <span className="text-muted-foreground font-normal">···{ba.accountMask}</span>
                    )}
                    {ba.forReviewCount > 0 && (
                      <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                        {ba.forReviewCount} to review
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">{formatCents(ba.bookBalanceCents)}</div>
                  <div className="text-xs text-muted-foreground">Book balance</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    GL account: {ba.accountName ?? "—"}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Unlinked CoA bank accounts — one-click connect */}
      {unlinked.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Available to connect
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {unlinked.map(acct => (
              <Card key={acct.id} className="border-dashed">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      <Landmark className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{acct.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {acct.code} · <span className="capitalize">{acct.subtype.replace(/_/g, " ")}</span>
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => connect.mutate(acct)}
                    disabled={connect.isPending}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Connect
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
