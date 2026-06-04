import { notFound } from "next/navigation";
import { prisma, requireOrg } from "@/lib/tenant";
import { formatCents } from "@/lib/money";
import { formatDate, toDateInput } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClearedCheckbox } from "@/components/banking/cleared-checkbox";
import { StartReconcileForm } from "@/components/banking/start-reconcile-form";
import {
  toggleCleared,
  finishReconciliation,
  cancelReconciliation,
} from "../../reconcile-actions";

export default async function ReconcilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrg();
  const orgId = ctx.organizationId;

  const bank = await prisma.bankAccount.findFirst({
    where: { id, organizationId: orgId },
    include: { account: true },
  });
  if (!bank) notFound();

  const inProgress = await prisma.reconciliation.findFirst({
    where: { organizationId: orgId, bankAccountId: id, status: "IN_PROGRESS" },
  });

  const completed = await prisma.reconciliation.findMany({
    where: { organizationId: orgId, bankAccountId: id, status: "COMPLETED" },
    orderBy: { statementDate: "desc" },
    take: 5,
  });

  const header = (
    <PageHeader
      title="Reconcile"
      description={`${bank.institutionName}${bank.accountMask ? ` ••${bank.accountMask}` : ""} · ${bank.account.name}`}
    />
  );

  if (!inProgress) {
    return (
      <>
        {header}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Start a reconciliation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Enter the ending balance from your bank statement, then check off transactions until
              the difference is zero.
            </p>
            <StartReconcileForm
              bankAccountId={id}
              defaultDate={toDateInput(new Date())}
              defaultBalance={(bank.bankBalanceCents / 100).toFixed(2)}
            />
          </CardContent>
        </Card>

        {completed.length > 0 && <CompletedList completed={completed} />}
      </>
    );
  }

  // In progress: list not-yet-reconciled transactions with cleared toggles.
  const txns = await prisma.bankTransaction.findMany({
    where: { organizationId: orgId, bankAccountId: id, reconciliationId: null, status: { not: "EXCLUDED" } },
    orderBy: { date: "asc" },
  });
  const clearedSum = txns.filter((t) => t.isCleared).reduce((s, t) => s + t.amountCents, 0);
  const difference = inProgress.statementBalanceCents - (inProgress.beginningBalanceCents + clearedSum);
  const balanced = difference === 0;

  const finish = finishReconciliation.bind(null, id, inProgress.id);
  const cancel = cancelReconciliation.bind(null, id, inProgress.id);

  return (
    <>
      {header}

      <div className="mb-4 grid grid-cols-4 gap-4">
        <Stat label="Statement balance" value={formatCents(inProgress.statementBalanceCents)} />
        <Stat label="Beginning balance" value={formatCents(inProgress.beginningBalanceCents)} />
        <Stat label="Cleared" value={formatCents(inProgress.beginningBalanceCents + clearedSum)} />
        <Stat
          label="Difference"
          value={formatCents(difference)}
          accent={balanced ? "text-green-700" : "text-destructive"}
        />
      </div>

      <Card>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-medium">
            {balanced ? (
              <Badge variant="success">Ready to finish — difference is zero</Badge>
            ) : (
              <Badge variant="warning">Check off transactions until the difference is zero</Badge>
            )}
          </div>
          <div className="flex gap-2">
            <form action={cancel}>
              <Button type="submit" variant="outline" size="sm">
                Cancel
              </Button>
            </form>
            <form action={finish}>
              <Button type="submit" size="sm" disabled={!balanced}>
                Finish reconciliation
              </Button>
            </form>
          </div>
        </div>

        <div className="divide-y">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-muted-foreground">
            <div className="col-span-1">Cleared</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-6">Description</div>
            <div className="col-span-3 text-right">Amount</div>
          </div>
          {txns.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No transactions to reconcile. Categorize or match items in the register first.
            </div>
          ) : (
            txns.map((t) => {
              const moneyIn = t.amountCents > 0;
              return (
                <div key={t.id} className="grid grid-cols-12 items-center gap-2 px-4 py-2.5 text-sm">
                  <div className="col-span-1">
                    <ClearedCheckbox
                      action={toggleCleared.bind(null, id, t.id)}
                      checked={t.isCleared}
                    />
                  </div>
                  <div className="col-span-2 text-muted-foreground">{formatDate(t.date)}</div>
                  <div className="col-span-6">{t.descriptionRaw}</div>
                  <div className={cn("col-span-3 text-right tabular-nums", moneyIn && "text-green-700")}>
                    {moneyIn ? "+" : "−"}
                    {formatCents(Math.abs(t.amountCents))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {completed.length > 0 && (
        <div className="mt-6">
          <CompletedList completed={completed} />
        </div>
      )}
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("mt-1 text-xl font-bold tabular-nums", accent)}>{value}</div>
      </CardContent>
    </Card>
  );
}

function CompletedList({
  completed,
}: {
  completed: { id: string; statementDate: Date; statementBalanceCents: number; reconciledAt: Date | null }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reconciliation history</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {completed.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <span>
                Statement {formatDate(r.statementDate)}
                {r.reconciledAt ? ` · reconciled ${formatDate(r.reconciledAt)}` : ""}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {formatCents(r.statementBalanceCents)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
