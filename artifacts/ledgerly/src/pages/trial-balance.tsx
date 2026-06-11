import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Download, Printer, Upload, FileText } from "lucide-react";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { downloadCsv, centsToPlain } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TbRow {
  id: string;
  code: string;
  name: string;
  type: string;
  debitCents: number;
  creditCents: number;
}
interface TrialBalance {
  asOf: string;
  rows: TbRow[];
  totalDebitsCents: number;
  totalCreditsCents: number;
  balanced: boolean;
  differenceCents: number;
  suspects: { code: string; name: string }[];
}
interface TbImport {
  id: string;
  effectiveDate: string;
  fileName: string | null;
  totalAccounts: number;
  accountsCreated: number;
  accountsMatched: number;
  totalDebitsCents: number;
  totalCreditsCents: number;
  balanced: boolean;
  status: string;
  importedByName: string | null;
  createdAt: string;
}

export default function TrialBalancePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState(today);
  const [includeZero, setIncludeZero] = useState(false);

  const { data } = useQuery({
    queryKey: ["trial-balance", asOf, includeZero],
    queryFn: () =>
      apiFetch<TrialBalance>(`/trial-balance?asOf=${asOf}&includeZero=${includeZero ? 1 : 0}`),
  });
  const { data: imports = [] } = useQuery({
    queryKey: ["tb-imports"],
    queryFn: () => apiFetch<TbImport[]>("/trial-balance/imports"),
  });

  function exportCsv() {
    if (!data) return;
    const rows: Array<Array<string | number>> = [
      ["Account #", "Account name", "Type", "Debit", "Credit"],
    ];
    for (const r of data.rows)
      rows.push([
        r.code,
        r.name,
        r.type,
        r.debitCents ? centsToPlain(r.debitCents) : "",
        r.creditCents ? centsToPlain(r.creditCents) : "",
      ]);
    rows.push([
      "",
      "TOTAL",
      "",
      centsToPlain(data.totalDebitsCents),
      centsToPlain(data.totalCreditsCents),
    ]);
    downloadCsv(`trial-balance-${asOf}.csv`, rows);
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Trial Balance</h1>
          <p className="text-sm text-muted-foreground">
            Account balances on their natural side, as of a date.
          </p>
        </div>
        <Button asChild>
          <Link href="/trial-balance/import">
            <Upload className="h-4 w-4 mr-1" /> Import trial balance
          </Link>
        </Button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 mb-4 print:hidden">
        <div className="space-y-1">
          <Label>As of date</Label>
          <Input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="w-40"
          />
        </div>
        <label className="flex items-center gap-2 text-sm h-9">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={includeZero}
            onChange={(e) => setIncludeZero(e.target.checked)}
          />
          Show zero-balance accounts
        </label>
        <div className="flex-1" />
        <Button variant="outline" onClick={exportCsv} disabled={!data}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
        <Button variant="outline" onClick={() => window.print()} disabled={!data}>
          <Printer className="h-4 w-4 mr-1" /> Print / PDF
        </Button>
      </div>

      {/* Balance status */}
      {data && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${data.balanced ? "border-green-300 bg-green-50/60 text-green-800" : "border-destructive/40 bg-destructive/10 text-destructive"}`}
        >
          {data.balanced ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
          <span className="font-medium">{data.balanced ? "Balanced" : "Out of balance"}</span>
          {!data.balanced && (
            <span>
              · Difference of {formatCents(Math.abs(data.differenceCents))}. Check:{" "}
              {data.suspects.map((s) => `${s.code} ${s.name}`).join(", ")}
            </span>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="hidden print:block">
          <CardTitle>Trial Balance — as of {data ? formatDate(data.asOf) : asOf}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Account #</TableHead>
                <TableHead>Account name</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {r.code}
                  </TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.debitCents ? formatCents(r.debitCents) : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.creditCents ? formatCents(r.creditCents) : ""}
                  </TableCell>
                </TableRow>
              ))}
              {data && (
                <TableRow className="border-t-2 font-bold">
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(data.totalDebitsCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(data.totalCreditsCents)}
                  </TableCell>
                </TableRow>
              )}
              {data && data.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No balances to show. Import a trial balance or record transactions.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Import history */}
      {imports.length > 0 && (
        <div className="mt-8 print:hidden">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Import history
          </h2>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Imported</TableHead>
                  <TableHead>Effective date</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Accounts</TableHead>
                  <TableHead className="text-right">Debits</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(i.createdAt)}
                      {i.importedByName ? ` · ${i.importedByName}` : ""}
                    </TableCell>
                    <TableCell>{formatDate(i.effectiveDate)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      <FileText className="h-3 w-3 inline mr-1" />
                      {i.fileName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {i.totalAccounts}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({i.accountsCreated} new)
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(i.totalDebitsCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(i.totalCreditsCents)}
                    </TableCell>
                    <TableCell>
                      {i.balanced ? (
                        <span className="text-green-700 text-sm">✓ Balanced</span>
                      ) : (
                        <span className="text-destructive text-sm">✗ Off</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
