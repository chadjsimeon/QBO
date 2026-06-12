import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useListAccounts } from "@workspace/api-client-react";
import { Download, Printer, Search } from "lucide-react";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { downloadCsv, centsToPlain } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}
interface GlLine {
  entryId: string;
  date: string;
  sourceType: string;
  sourceId: string | null;
  memo: string | null;
  debitCents: number;
  creditCents: number;
  runningBalanceCents: number;
}
interface GlGroup {
  account: Account & { subtype: string; isActive: boolean };
  openingCents: number;
  debitTotalCents: number;
  creditTotalCents: number;
  closingCents: number;
  lines: GlLine[];
}
interface SummaryRow {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
  openingCents: number;
  debitTotalCents: number;
  creditTotalCents: number;
  closingCents: number;
}

const SOURCE_TYPES = [
  "INVOICE",
  "BILL",
  "PAYMENT",
  "EXPENSE",
  "SALES_RECEIPT",
  "REFUND_RECEIPT",
  "CREDIT_NOTE",
  "VENDOR_CREDIT",
  "CC_CREDIT",
  "TRANSFER",
  "BANK",
  "ADJUSTMENT",
  "MANUAL",
];
const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];

function balanceClass(cents: number) {
  return cents > 0 ? "text-foreground" : cents < 0 ? "text-destructive" : "text-muted-foreground";
}

export default function GeneralLedgerPage() {
  const [, navigate] = useLocation();
  const [accountId, setAccountId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState<"code" | "balance" | "type">("code");

  const { data: accounts = [] } = useListAccounts();

  const glQs = new URLSearchParams();
  if (accountId) glQs.set("accountId", accountId);
  if (start) glQs.set("start", start);
  if (end) glQs.set("end", end);
  if (sourceType) glQs.set("sourceType", sourceType);
  if (q) glQs.set("q", q);

  const { data: gl, isFetching } = useQuery({
    queryKey: ["general-ledger", glQs.toString()],
    queryFn: () => apiFetch<{ accounts: GlGroup[] }>(`/general-ledger?${glQs.toString()}`),
  });

  const sumQs = new URLSearchParams();
  if (start) sumQs.set("start", start);
  if (end) sumQs.set("end", end);
  if (typeFilter) sumQs.set("type", typeFilter);
  const { data: summary } = useQuery({
    queryKey: ["gl-summary", sumQs.toString()],
    queryFn: () => apiFetch<{ rows: SummaryRow[] }>(`/general-ledger/summary?${sumQs.toString()}`),
  });

  const groups = gl?.accounts ?? [];

  function exportLedgerCsv() {
    const rows: Array<Array<string | number>> = [
      ["Account #", "Account", "Date", "Type", "Description", "Debit", "Credit", "Running balance"],
    ];
    for (const g of groups) {
      rows.push([
        g.account.code,
        g.account.name,
        "",
        "",
        "Opening balance",
        "",
        "",
        centsToPlain(g.openingCents),
      ]);
      for (const l of g.lines)
        rows.push([
          g.account.code,
          g.account.name,
          formatDate(l.date),
          l.sourceType,
          l.memo ?? "",
          l.debitCents ? centsToPlain(l.debitCents) : "",
          l.creditCents ? centsToPlain(l.creditCents) : "",
          centsToPlain(l.runningBalanceCents),
        ]);
      rows.push([
        g.account.code,
        g.account.name,
        "",
        "",
        "Closing balance",
        centsToPlain(g.debitTotalCents),
        centsToPlain(g.creditTotalCents),
        centsToPlain(g.closingCents),
      ]);
    }
    downloadCsv("general-ledger.csv", rows);
  }

  const sortedSummary = [...(summary?.rows ?? [])].sort((a, b) => {
    if (sortBy === "balance") return Math.abs(b.closingCents) - Math.abs(a.closingCents);
    if (sortBy === "type") return a.type.localeCompare(b.type) || a.code.localeCompare(b.code);
    return a.code.localeCompare(b.code);
  });

  function exportSummaryCsv() {
    const rows: Array<Array<string | number>> = [
      ["Account #", "Account name", "Type", "Opening", "Debits", "Credits", "Closing"],
    ];
    for (const r of sortedSummary)
      rows.push([
        r.code,
        r.name,
        r.type,
        centsToPlain(r.openingCents),
        centsToPlain(r.debitTotalCents),
        centsToPlain(r.creditTotalCents),
        centsToPlain(r.closingCents),
      ]);
    downloadCsv("account-summary.csv", rows);
  }

  return (
    <>
      <div className="mb-6 print:hidden">
        <h1 className="text-2xl font-bold">General Ledger</h1>
        <p className="text-sm text-muted-foreground">
          Every posted transaction, organized by account.
        </p>
      </div>

      <Tabs defaultValue="ledger">
        <TabsList className="print:hidden">
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="summary">Account summary</TabsTrigger>
        </TabsList>

        {/* ── LEDGER ── */}
        <TabsContent value="ledger" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 print:hidden">
            <div className="space-y-1">
              <Label className="text-xs">Account</Label>
              <Select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-56"
              >
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-36"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-36"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                className="w-44"
              >
                <option value="">All types</option>
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="memo / description"
                  className="w-48 pl-7"
                />
              </div>
            </div>
            <div className="flex-1" />
            <Button variant="outline" onClick={exportLedgerCsv} disabled={!groups.length}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={!groups.length}>
              <Printer className="h-4 w-4 mr-1" /> Print / PDF
            </Button>
          </div>

          {isFetching && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isFetching && groups.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No transactions match these filters.
              </CardContent>
            </Card>
          )}

          <div className="space-y-6">
            {groups.map((g) => (
              <div key={g.account.id}>
                <div className="flex items-baseline justify-between mb-1">
                  <h2 className="text-sm font-semibold">
                    <span className="font-mono text-muted-foreground mr-2">{g.account.code}</span>
                    {g.account.name}
                    <Badge variant="outline" className="ml-2 text-xs">
                      {g.account.type}
                    </Badge>
                    {!g.account.isActive && (
                      <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                    )}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    Closing:{" "}
                    <span className={`font-semibold ${balanceClass(g.closingCents)}`}>
                      {formatCents(g.closingCents)}
                    </span>
                  </span>
                </div>
                <Card className="overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28">Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-32">Type</TableHead>
                        <TableHead className="text-right w-28">Debit</TableHead>
                        <TableHead className="text-right w-28">Credit</TableHead>
                        <TableHead className="text-right w-32">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={5} className="text-sm font-medium">
                          Opening balance
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatCents(g.openingCents)}
                        </TableCell>
                      </TableRow>
                      {g.lines.map((l, i) => (
                        <TableRow
                          key={l.entryId + i}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => navigate(`/journal-entries/${l.entryId}`)}
                        >
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {formatDate(l.date)}
                          </TableCell>
                          <TableCell className="max-w-[20rem] truncate">{l.memo ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {l.sourceType.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {l.debitCents ? formatCents(l.debitCents) : ""}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {l.creditCents ? formatCents(l.creditCents) : ""}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${balanceClass(l.runningBalanceCents)}`}
                          >
                            {formatCents(l.runningBalanceCents)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2 font-semibold">
                        <TableCell colSpan={3}>Closing balance · {g.account.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCents(g.debitTotalCents)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCents(g.creditTotalCents)}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${balanceClass(g.closingCents)}`}
                        >
                          {formatCents(g.closingCents)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </Card>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── SUMMARY ── */}
        <TabsContent value="summary" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 print:hidden">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-36"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-36"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Account type</Label>
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-40"
              >
                <option value="">All types</option>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sort by</Label>
              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-36"
              >
                <option value="code">Account number</option>
                <option value="balance">Balance</option>
                <option value="type">Type</option>
              </Select>
            </div>
            <div className="flex-1" />
            <Button variant="outline" onClick={exportSummaryCsv} disabled={!sortedSummary.length}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => window.print()}
              disabled={!sortedSummary.length}
            >
              <Printer className="h-4 w-4 mr-1" /> Print / PDF
            </Button>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Account #</TableHead>
                  <TableHead>Account name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Debits</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead className="text-right">Closing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedSummary.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {r.code}
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.name}
                      {!r.isActive && (
                        <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {r.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.openingCents ? formatCents(r.openingCents) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.debitTotalCents ? formatCents(r.debitTotalCents) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.creditTotalCents ? formatCents(r.creditTotalCents) : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-medium ${balanceClass(r.closingCents)}`}
                    >
                      {formatCents(r.closingCents)}
                    </TableCell>
                  </TableRow>
                ))}
                {sortedSummary.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No accounts.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
