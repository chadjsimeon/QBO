import { useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Ban, Undo2, Link2 } from "lucide-react";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface BankAccount {
  id: string; accountId: string; accountName: string | null;
  institutionName: string; accountMask: string | null;
  bankBalanceCents: number; forReviewCount: number;
}
interface Account {
  id: string; code: string; name: string; type: string; subtype: string;
  systemRole: string | null; isActive: boolean;
}
interface Txn {
  id: string; date: string; descriptionRaw: string; amountCents: number;
  status: "FOR_REVIEW" | "CATEGORIZED" | "EXCLUDED";
  matchType: "MATCHED" | "ADDED" | null;
  categorizedAccountId: string | null; memo: string | null;
  referenceNumber: string | null; payeeName: string | null;
  matchedInvoiceId: string | null; matchedBillId: string | null;
}

type Tab = "FOR_REVIEW" | "CATEGORIZED" | "EXCLUDED";

// Chart-of-accounts type ordering for the category dropdown. The preferred type for the
// transaction's direction is floated to the top (income for deposits, expense for payments).
const TYPE_LABEL: Record<string, string> = {
  INCOME: "Income", EXPENSE: "Expense", ASSET: "Asset", LIABILITY: "Liability", EQUITY: "Equity",
};

export default function BankAccountReviewPage() {
  const [, params] = useRoute("/banking/:id");
  const id = params?.id ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>("FOR_REVIEW");
  const [pick, setPick] = useState<Record<string, string>>({});      // txnId → chosen accountId
  const [selected, setSelected] = useState<Set<string>>(new Set());  // bulk selection
  const [bulkAccountId, setBulkAccountId] = useState("");

  const { data: bankAccounts = [] } = useQuery({ queryKey: ["bank-accounts"], queryFn: () => apiFetch<BankAccount[]>("/bank-accounts") });
  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: () => apiFetch<Account[]>("/accounts") });
  const { data: txns = [] } = useQuery({ queryKey: ["bank-account-txns", id], queryFn: () => apiFetch<Txn[]>(`/bank-accounts/${id}/transactions`) });

  const account = bankAccounts.find(b => b.id === id);

  // Postable category accounts: active, excluding the bank's own GL account and AR/AP
  // (those are reached via invoice/bill matching, not free categorization).
  const categoryAccounts = useMemo(() => accounts.filter(a =>
    a.isActive && a.id !== account?.accountId && a.systemRole !== "AR" && a.systemRole !== "AP",
  ), [accounts, account?.accountId]);

  const accountName = (accountId: string | null) => {
    const a = accounts.find(x => x.id === accountId);
    return a ? `${a.code} · ${a.name}` : "—";
  };

  // Grouped <optgroup> list, preferred type first based on transaction direction.
  function groupsFor(deposit: boolean): Array<[string, Account[]]> {
    const order = deposit
      ? ["INCOME", "EXPENSE", "ASSET", "LIABILITY", "EQUITY"]
      : ["EXPENSE", "INCOME", "ASSET", "LIABILITY", "EQUITY"];
    return order
      .map(t => [TYPE_LABEL[t], categoryAccounts.filter(a => a.type === t)] as [string, Account[]])
      .filter(([, list]) => list.length > 0);
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["bank-account-txns", id] });
    qc.invalidateQueries({ queryKey: ["bank-accounts"] });
  };

  const categorize = useMutation({
    mutationFn: ({ txnId, accountId }: { txnId: string; accountId: string }) =>
      apiFetch(`/bank-transactions/${txnId}/categorize`, { method: "POST", body: JSON.stringify({ accountId }) }),
    onSuccess: () => { invalidate(); toast({ title: "Transaction categorized" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bulkCategorize = useMutation({
    mutationFn: ({ ids, accountId }: { ids: string[]; accountId: string }) =>
      apiFetch<{ categorized: number }>("/bank-transactions/bulk-categorize", { method: "POST", body: JSON.stringify({ ids, accountId }) }),
    onSuccess: (data) => { invalidate(); setSelected(new Set()); setBulkAccountId(""); toast({ title: `${data.categorized} transactions categorized` }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const match = useMutation({
    mutationFn: ({ txnId, kind, documentId }: { txnId: string; kind: "invoice" | "bill"; documentId: string }) =>
      apiFetch(`/bank-transactions/${txnId}/match`, { method: "POST", body: JSON.stringify({ kind, documentId }) }),
    onSuccess: () => { invalidate(); toast({ title: "Matched and posted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const exclude = useMutation({
    mutationFn: (txnId: string) => apiFetch(`/bank-transactions/${txnId}/exclude`, { method: "POST" }),
    onSuccess: () => { invalidate(); toast({ title: "Transaction excluded" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const undo = useMutation({
    mutationFn: (txnId: string) => apiFetch(`/bank-transactions/${txnId}/undo`, { method: "POST" }),
    onSuccess: () => { invalidate(); toast({ title: "Moved back to For Review" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const byStatus = (s: Tab) => txns.filter(t => t.status === s);
  const forReview = byStatus("FOR_REVIEW");
  const categorized = byStatus("CATEGORIZED");
  const excluded = byStatus("EXCLUDED");
  const rows = byStatus(tab);

  const toggleSelect = (txnId: string) => setSelected(s => {
    const next = new Set(s);
    if (next.has(txnId)) next.delete(txnId);
    else next.add(txnId);
    return next;
  });
  const allSelected = forReview.length > 0 && forReview.every(t => selected.has(t.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(forReview.map(t => t.id)));

  const TABS: Array<[Tab, string, number]> = [
    ["FOR_REVIEW", "For Review", forReview.length],
    ["CATEGORIZED", "Categorized", categorized.length],
    ["EXCLUDED", "Excluded", excluded.length],
  ];

  return (
    <>
      <div className="mb-6">
        <Link href="/banking" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-3 w-3" /> Back to banking
        </Link>
        <h1 className="text-2xl font-bold">
          {account ? account.institutionName : "Bank account"}
          {account?.accountMask && <span className="text-muted-foreground font-normal"> ···{account.accountMask}</span>}
        </h1>
        {account?.accountName && <p className="text-sm text-muted-foreground">GL account: {account.accountName}</p>}
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b">
        {TABS.map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label} <span className="text-muted-foreground">({count})</span>
          </button>
        ))}
      </div>

      {/* Bulk action bar (For Review only) */}
      {tab === "FOR_REVIEW" && selected.size > 0 && (
        <Card className="mb-3">
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <span className="text-sm text-muted-foreground">Categorize as</span>
            <Select className="h-8 w-64" value={bulkAccountId} onChange={e => setBulkAccountId(e.target.value)}>
              <option value="">Select account…</option>
              {(["INCOME", "EXPENSE", "ASSET", "LIABILITY", "EQUITY"] as const).map(t => {
                const list = categoryAccounts.filter(a => a.type === t);
                return list.length ? (
                  <optgroup key={t} label={TYPE_LABEL[t]}>
                    {list.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                  </optgroup>
                ) : null;
              })}
            </Select>
            <Button size="sm" disabled={!bulkAccountId || bulkCategorize.isPending}
              onClick={() => bulkCategorize.mutate({ ids: [...selected], accountId: bulkAccountId })}>
              Apply to {selected.size}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={tab === "FOR_REVIEW" ? "Nothing to review" : tab === "CATEGORIZED" ? "No categorized transactions" : "No excluded transactions"}
          description={tab === "FOR_REVIEW" ? "Imported transactions awaiting categorization will appear here." : ""}
        />
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {tab === "FOR_REVIEW" && (
                    <TableHead className="w-8">
                      <input type="checkbox" className="h-4 w-4" checked={allSelected} onChange={toggleAll} />
                    </TableHead>
                  )}
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>{tab === "FOR_REVIEW" ? "Category" : tab === "CATEGORIZED" ? "Categorized as" : ""}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(t => {
                  const deposit = t.amountCents > 0;
                  const matchKind = t.matchedInvoiceId ? "invoice" : t.matchedBillId ? "bill" : null;
                  const matchId = t.matchedInvoiceId ?? t.matchedBillId ?? null;
                  return (
                    <TableRow key={t.id}>
                      {tab === "FOR_REVIEW" && (
                        <TableCell>
                          <input type="checkbox" className="h-4 w-4" checked={selected.has(t.id)} onChange={() => toggleSelect(t.id)} />
                        </TableCell>
                      )}
                      <TableCell className="text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</TableCell>
                      <TableCell className="max-w-[20rem]">
                        <div className="truncate">{t.descriptionRaw}</div>
                        {(t.payeeName || t.referenceNumber) && (
                          <div className="text-xs text-muted-foreground truncate">
                            {t.payeeName}{t.payeeName && t.referenceNumber ? " · " : ""}{t.referenceNumber}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${deposit ? "text-green-600" : ""}`}>
                        {deposit ? "+" : "−"}{formatCents(Math.abs(t.amountCents))}
                      </TableCell>

                      {tab === "FOR_REVIEW" && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Select className="h-8 w-56" value={pick[t.id] ?? ""} onChange={e => setPick(p => ({ ...p, [t.id]: e.target.value }))}>
                              <option value="">Select category…</option>
                              {groupsFor(deposit).map(([label, list]) => (
                                <optgroup key={label} label={label}>
                                  {list.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                                </optgroup>
                              ))}
                            </Select>
                            {matchKind && matchId && (
                              <Badge variant="muted" className="whitespace-nowrap">Matches {matchKind}</Badge>
                            )}
                          </div>
                        </TableCell>
                      )}
                      {tab === "CATEGORIZED" && (
                        <TableCell className="text-sm">
                          {t.matchType === "MATCHED"
                            ? <Badge variant="muted">Matched {t.matchedInvoiceId ? "invoice" : "bill"}</Badge>
                            : accountName(t.categorizedAccountId)}
                        </TableCell>
                      )}
                      {tab === "EXCLUDED" && <TableCell />}

                      <TableCell className="text-right">
                        {tab === "FOR_REVIEW" && (
                          <div className="flex justify-end gap-1">
                            {matchKind && matchId ? (
                              <Button size="sm" variant="outline" disabled={match.isPending}
                                onClick={() => match.mutate({ txnId: t.id, kind: matchKind, documentId: matchId })}>
                                <Link2 className="h-3.5 w-3.5 mr-1" /> Match
                              </Button>
                            ) : null}
                            <Button size="sm" disabled={!pick[t.id] || categorize.isPending}
                              onClick={() => categorize.mutate({ txnId: t.id, accountId: pick[t.id] })}>
                              <Check className="h-3.5 w-3.5 mr-1" /> Add
                            </Button>
                            <Button size="sm" variant="ghost" disabled={exclude.isPending}
                              onClick={() => exclude.mutate(t.id)}>
                              <Ban className="h-3.5 w-3.5 mr-1" /> Exclude
                            </Button>
                          </div>
                        )}
                        {tab !== "FOR_REVIEW" && (
                          <Button size="sm" variant="ghost" disabled={undo.isPending} onClick={() => undo.mutate(t.id)}>
                            <Undo2 className="h-3.5 w-3.5 mr-1" /> Undo
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
