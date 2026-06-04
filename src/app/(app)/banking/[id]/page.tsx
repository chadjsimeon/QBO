import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, requireOrg } from "@/lib/tenant";
import { reviewCounts, findMatchCandidates } from "@/lib/banking";
import { toDateInput } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImportBar } from "@/components/banking/import-bar";
import { ReviewRow } from "@/components/banking/review-row";
import {
  importCsv,
  loadSampleTransactions,
  addManualTransaction,
  categorizeTransaction,
  matchTransaction,
  excludeTransaction,
  undoTransaction,
} from "../actions";

type Tab = "for-review" | "categorized" | "excluded";
const STATUS_FOR: Record<Tab, "FOR_REVIEW" | "CATEGORIZED" | "EXCLUDED"> = {
  "for-review": "FOR_REVIEW",
  categorized: "CATEGORIZED",
  excluded: "EXCLUDED",
};

export default async function BankRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: Tab = (["for-review", "categorized", "excluded"] as Tab[]).includes(tabParam as Tab)
    ? (tabParam as Tab)
    : "for-review";

  const ctx = await requireOrg();
  const orgId = ctx.organizationId;

  const bank = await prisma.bankAccount.findFirst({
    where: { id, organizationId: orgId },
    include: { account: true },
  });
  if (!bank) notFound();

  const [counts, transactions, accounts, vendors, customers] = await Promise.all([
    reviewCounts(orgId, id),
    prisma.bankTransaction.findMany({
      where: { organizationId: orgId, bankAccountId: id, status: STATUS_FOR[tab] },
      orderBy: { date: "desc" },
      include: { categorizedAccount: true, payeeVendor: true, payeeCustomer: true, journalEntry: true },
    }),
    prisma.account.findMany({
      where: { organizationId: orgId, isActive: true, id: { not: bank.accountId } },
      orderBy: [{ type: "asc" }, { code: "asc" }],
    }),
    prisma.vendor.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" } }),
    prisma.customer.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" } }),
  ]);

  const accountOpts = accounts.map((a) => ({ id: a.id, code: a.code, name: a.name }));
  const vendorOpts = vendors.map((v) => ({ id: v.id, name: v.name }));
  const customerOpts = customers.map((c) => ({ id: c.id, name: c.name }));

  // Match candidates only needed on the review tab.
  const candidatesByTxn = new Map<string, Awaited<ReturnType<typeof findMatchCandidates>>>();
  if (tab === "for-review") {
    await Promise.all(
      transactions.map(async (t) => {
        candidatesByTxn.set(
          t.id,
          await findMatchCandidates(orgId, bank.accountId, { date: t.date, amountCents: t.amountCents })
        );
      })
    );
  }

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "for-review", label: "For review", count: counts.FOR_REVIEW },
    { key: "categorized", label: "Categorized", count: counts.CATEGORIZED },
    { key: "excluded", label: "Excluded", count: counts.EXCLUDED },
  ];

  return (
    <>
      <PageHeader
        title={`${bank.institutionName}${bank.accountMask ? ` ••${bank.accountMask}` : ""}`}
        description={`${bank.account.code} · ${bank.account.name}`}
        action={
          <Button asChild variant="outline">
            <Link href={`/banking/${id}/reconcile`}>Reconcile</Link>
          </Button>
        }
      />

      {tab === "for-review" && (
        <ImportBar
          importAction={importCsv.bind(null, id)}
          sampleAction={loadSampleTransactions.bind(null, id)}
          manualAction={addManualTransaction.bind(null, id)}
          today={toDateInput(new Date())}
        />
      )}

      <div className="mb-3 flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/banking/${id}?tab=${t.key}`}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            <Badge variant={tab === t.key ? "default" : "muted"}>{t.count}</Badge>
          </Link>
        ))}
      </div>

      <Card>
        {transactions.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {tab === "for-review"
              ? "Nothing to review. Import a CSV or load sample transactions above."
              : `No ${tab} transactions.`}
          </div>
        ) : tab === "for-review" ? (
          <div>
            {transactions.map((t) => (
              <ReviewRow
                key={t.id}
                txn={{
                  id: t.id,
                  date: toDateInput(t.date),
                  descriptionRaw: t.descriptionRaw,
                  amountCents: t.amountCents,
                }}
                accounts={accountOpts}
                payees={t.amountCents > 0 ? customerOpts : vendorOpts}
                candidates={candidatesByTxn.get(t.id) ?? []}
                categorizeAction={categorizeTransaction.bind(null, t.id)}
                matchAction={matchTransaction.bind(null, t.id)}
                excludeAction={excludeTransaction.bind(null, t.id)}
              />
            ))}
          </div>
        ) : (
          <div className="divide-y">
            {transactions.map((t) => {
              const moneyIn = t.amountCents > 0;
              const category =
                t.matchType === "MATCHED"
                  ? "Matched to existing entry"
                  : t.categorizedAccount
                  ? `${t.categorizedAccount.code} · ${t.categorizedAccount.name}`
                  : t.journalEntry
                  ? "Split"
                  : "—";
              const payee = t.payeeVendor?.name ?? t.payeeCustomer?.name;
              const undo = undoTransaction.bind(null, t.id);
              return (
                <div key={t.id} className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm">
                  <div className="col-span-2 text-muted-foreground">{formatDate(t.date)}</div>
                  <div className="col-span-3 font-medium">{t.descriptionRaw}</div>
                  <div className="col-span-3 text-muted-foreground">
                    {category}
                    {payee ? ` · ${payee}` : ""}
                  </div>
                  <div
                    className={cn(
                      "col-span-2 text-right tabular-nums",
                      moneyIn ? "text-green-700" : "text-foreground"
                    )}
                  >
                    {moneyIn ? "+" : "−"}
                    {formatCents(Math.abs(t.amountCents))}
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <form action={undo}>
                      <Button type="submit" variant="ghost" size="sm">
                        Undo
                      </Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
