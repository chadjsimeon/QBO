import Link from "next/link";
import { Landmark, ArrowRight } from "lucide-react";
import { prisma, requireOrg } from "@/lib/tenant";
import { bookBalanceCents, reviewCounts } from "@/lib/banking";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectForm } from "@/components/banking/connect-form";

export default async function BankingPage() {
  const ctx = await requireOrg();
  const orgId = ctx.organizationId;

  const [bankAccounts, glAccounts] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { organizationId: orgId },
      include: { account: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.account.findMany({
      where: { organizationId: orgId, type: "ASSET", subtype: "Bank", isActive: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const cards = await Promise.all(
    bankAccounts.map(async (b) => ({
      bank: b,
      bookCents: await bookBalanceCents(orgId, b.accountId),
      counts: await reviewCounts(orgId, b.id),
    }))
  );

  const connectedIds = new Set(bankAccounts.map((b) => b.accountId));
  const available = glAccounts.filter((a) => !connectedIds.has(a.id));

  return (
    <>
      <PageHeader
        title="Banking"
        description="Connect accounts, import transactions, and match them to your books."
      />

      {cards.length === 0 ? (
        <Card className="mb-6">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No bank accounts connected yet. Connect one below to start importing transactions.
          </CardContent>
        </Card>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-4">
          {cards.map(({ bank, bookCents, counts }) => (
            <Card key={bank.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium">
                        {bank.institutionName}
                        {bank.accountMask ? ` ••${bank.accountMask}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {bank.account.code} · {bank.account.name}
                      </div>
                    </div>
                  </div>
                  {counts.FOR_REVIEW > 0 && (
                    <Badge variant="warning">{counts.FOR_REVIEW} for review</Badge>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Bank balance</div>
                    <div className="text-xl font-bold tabular-nums">
                      {formatCents(bank.bankBalanceCents)}
                    </div>
                    {bank.bankBalanceAsOf && (
                      <div className="text-[11px] text-muted-foreground">
                        as of {formatDate(bank.bankBalanceAsOf)}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">In QuickBooks (book)</div>
                    <div className="text-xl font-bold tabular-nums">{formatCents(bookCents)}</div>
                    {bookCents !== bank.bankBalanceCents && (
                      <div className="text-[11px] text-amber-700">
                        {formatCents(Math.abs(bank.bankBalanceCents - bookCents))} difference
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button asChild size="sm">
                    <Link href={`/banking/${bank.id}`}>
                      Review transactions <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/banking/${bank.id}/reconcile`}>Reconcile</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connect a bank account</CardTitle>
        </CardHeader>
        <CardContent>
          <ConnectForm glAccounts={available} />
        </CardContent>
      </Card>
    </>
  );
}
