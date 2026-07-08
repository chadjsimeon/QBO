import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import Papa from "papaparse";
import {
  ArrowLeft,
  ArrowRight,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Pencil,
  Trash2,
  Loader2,
  Download,
} from "lucide-react";
import { apiFetch, formatCents } from "@/lib/api";
import { downloadCsv } from "@/lib/export";
import { DETAIL_TYPES, defaultSubtypeFor } from "@/lib/account-detail-types";
import {
  tbAutodetectMapping,
  buildTbRows,
  TB_REQUIRED_FIELDS,
  TB_OPTIONAL_FIELDS,
  TB_FIELD_LABELS,
  type TbFieldKey,
} from "@/lib/trial-balance-import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type DupStrategy = "balances" | "overwrite" | "skip";
const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
const STEPS = ["Upload", "Map columns", "Validate", "Review", "Import", "Done"];
const MAX_BYTES = 25 * 1024 * 1024;

interface ReviewRow {
  accountNumber: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
  accountType: string;
  subtype: string;
  description: string;
  status: "create" | "match";
  existingName: string | null;
  include: boolean;
}
interface AnalyzeResult {
  results: Array<{
    index: number;
    accountNumber: string;
    accountName: string;
    debitCents: number;
    creditCents: number;
    type: string;
    status: string;
    existingAccountId: string | null;
    existingName: string | null;
    errors: string[];
  }>;
  createCount: number;
  matchCount: number;
  errorCount: number;
  totalDebitsCents: number;
  totalCreditsCents: number;
  balanced: boolean;
  differenceCents: number;
}
interface CommitResult {
  importId: string;
  accountsCreated: number;
  accountsMatched: number;
  accountsSkipped: number;
  failed: number;
  failures: { index: number; reason: string }[];
  totalDebitsCents: number;
  totalCreditsCents: number;
  balanced: boolean;
}

export default function TrialBalanceImportPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [duplicateStrategy, setDuplicateStrategy] = useState<DupStrategy>("balances");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<TbFieldKey, string>>({
    accountNumber: "",
    accountName: "",
    debit: "",
    credit: "",
    accountType: "",
    description: "",
  });
  const [dragOver, setDragOver] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [review, setReview] = useState<ReviewRow[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<CommitResult | null>(null);

  const mapped = useMemo(() => buildTbRows(rawRows, mapping), [rawRows, mapping]);
  const validRows = useMemo(() => mapped.filter((m) => m.errors.length === 0), [mapped]);
  const invalidRows = useMemo(() => mapped.filter((m) => m.errors.length > 0), [mapped]);

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      toast({
        title: "Invalid file",
        description: "Please upload a .csv file.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "File too large", description: "Max 25MB.", variant: "destructive" });
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        const flds = (res.meta.fields ?? []).filter(Boolean);
        if (flds.length === 0 || res.data.length === 0) {
          toast({
            title: "Empty file",
            description: "No header or rows detected.",
            variant: "destructive",
          });
          return;
        }
        setFileName(file.name);
        setHeaders(flds);
        setRawRows(res.data);
        setMapping(tbAutodetectMapping(flds));
        setStep(2);
      },
      error: (err) =>
        toast({ title: "Parse error", description: err.message, variant: "destructive" }),
    });
  }

  const analyze = useMutation({
    mutationFn: () =>
      apiFetch<AnalyzeResult>("/trial-balance/import/analyze", {
        method: "POST",
        body: JSON.stringify({
          rows: validRows.map((r) => ({
            accountNumber: r.accountNumber,
            accountName: r.accountName,
            debitCents: r.debitCents,
            creditCents: r.creditCents,
            accountType: r.accountType,
            description: r.description,
          })),
        }),
      }),
    onSuccess: (data) => {
      setAnalysis(data);
      setReview(
        data.results
          .filter((r) => r.status !== "error")
          .map((r) => ({
            accountNumber: r.accountNumber,
            accountName: r.accountName,
            debitCents: r.debitCents,
            creditCents: r.creditCents,
            accountType: r.type,
            subtype: defaultSubtypeFor(r.type, r.accountName),
            description: "",
            status: r.status as "create" | "match",
            existingName: r.existingName,
            include: true,
          })),
      );
      setStep(3);
    },
    onError: (e: Error) =>
      toast({ title: "Validation failed", description: e.message, variant: "destructive" }),
  });

  const commit = useMutation({
    mutationFn: () => {
      setProgress(40);
      const rows = review
        .filter((r) => r.include)
        .map((r) => ({
          accountNumber: r.accountNumber,
          accountName: r.accountName,
          debitCents: r.debitCents,
          creditCents: r.creditCents,
          accountType: r.accountType,
          subtype: r.subtype,
          description: r.description,
        }));
      return apiFetch<CommitResult>("/trial-balance/import/commit", {
        method: "POST",
        body: JSON.stringify({ effectiveDate, fileName, duplicateStrategy, rows }),
      });
    },
    onSuccess: (data) => {
      setProgress(100);
      setResult(data);
      setStep(6);
    },
    onError: (e: Error) => {
      setProgress(0);
      setStep(4);
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    },
  });

  const included = review.filter((r) => r.include);
  const summary = useMemo(() => {
    const debits = included.reduce((s, r) => s + r.debitCents, 0);
    const credits = included.reduce((s, r) => s + r.creditCents, 0);
    return {
      count: included.length,
      create: included.filter((r) => r.status === "create").length,
      match: included.filter((r) => r.status === "match").length,
      debits,
      credits,
      balanced: debits === credits,
      difference: debits - credits,
    };
  }, [included]);

  function downloadErrorReport() {
    downloadCsv("trial-balance-errors.csv", [
      ["row", "reason"],
      ...invalidRows.map((r) => [r.rowIndex, r.errors.join("; ")]),
    ]);
  }

  return (
    <>
      <div className="mb-6">
        <Link
          href="/trial-balance"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to trial balance
        </Link>
        <h1 className="text-2xl font-bold">Import trial balance</h1>
        <p className="text-sm text-muted-foreground">
          Bring in opening balances and create accounts from a CSV.
        </p>
      </div>

      {/* Stepper */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
        {STEPS.map((label, i) => {
          const n = i + 1;
          return (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${n < step ? "bg-primary text-primary-foreground" : n === step ? "bg-primary/15 text-primary ring-1 ring-primary" : "bg-muted text-muted-foreground"}`}
              >
                {n < step ? "✓" : n}
              </span>
              <span className={n === step ? "font-medium" : "text-muted-foreground"}>{label}</span>
              {n < STEPS.length && <span className="text-muted-foreground">→</span>}
            </div>
          );
        })}
      </div>

      {/* STEP 1 — Upload */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload your trial balance CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
              <div className="space-y-1">
                <Label>Effective (as of) date *</Label>
                <Input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>If an account already exists</Label>
                <Select
                  value={duplicateStrategy}
                  onChange={(e) => setDuplicateStrategy(e.target.value as DupStrategy)}
                >
                  <option value="balances">Update its balance only</option>
                  <option value="overwrite">Overwrite name, type &amp; balance</option>
                  <option value="skip">Skip it</option>
                </Select>
              </div>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-14 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <UploadCloud className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Drag &amp; drop your .csv here</p>
              <p className="text-xs text-muted-foreground">or</p>
              <Button className="mt-2" variant="outline" onClick={() => fileRef.current?.click()}>
                Choose file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                Required columns: Account Number, Account Name, Debit Balance, Credit Balance
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2 — Map columns */}
      {step === 2 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Map your columns</CardTitle>
              <p className="text-sm text-muted-foreground">
                {rawRows.length} rows · {headers.length} columns ·{" "}
                <span className="font-medium">{fileName}</span>
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...TB_REQUIRED_FIELDS, ...TB_OPTIONAL_FIELDS].map((field) => {
                  const required = TB_REQUIRED_FIELDS.includes(field);
                  const sample = mapping[field]
                    ? (rawRows.find((r) => r[mapping[field]])?.[mapping[field]] ?? "")
                    : "";
                  return (
                    <div key={field} className="space-y-1">
                      <Label className="text-xs">
                        {TB_FIELD_LABELS[field]}{" "}
                        {required && <span className="text-destructive">*</span>}
                      </Label>
                      <Select
                        value={mapping[field]}
                        onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                      >
                        <option value="">— not mapped —</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </Select>
                      {sample && (
                        <p className="truncate text-[11px] text-muted-foreground">e.g. {sample}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">Preview · first 10 rows</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rawRows.slice(0, 10).map((r, i) => (
                    <TableRow key={i}>
                      {headers.map((h) => (
                        <TableCell key={h} className="whitespace-nowrap text-muted-foreground">
                          {r[h]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              disabled={
                !TB_REQUIRED_FIELDS.every((f) => mapping[f]) ||
                validRows.length === 0 ||
                analyze.isPending
              }
              onClick={() => analyze.mutate()}
            >
              {analyze.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Checking…
                </>
              ) : (
                <>
                  Validate <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3 — Validate */}
      {step === 3 && analysis && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Rows in file" value={String(mapped.length)} />
            <Stat label="New accounts" value={String(analysis.createCount)} tone="good" />
            <Stat label="Existing (matched)" value={String(analysis.matchCount)} />
            <Stat
              label="Invalid (skipped)"
              value={String(invalidRows.length)}
              tone={invalidRows.length ? "warn" : undefined}
            />
          </div>

          <div
            className={`flex items-center gap-2 rounded-md border px-4 py-3 text-sm ${analysis.balanced ? "border-green-300 bg-green-50/60 text-green-800" : "border-destructive/40 bg-destructive/10 text-destructive"}`}
          >
            {analysis.balanced ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
            <span className="font-medium">
              {analysis.balanced ? "Trial balance is balanced" : "Trial balance is out of balance"}
            </span>
            <span>
              · Debits {formatCents(analysis.totalDebitsCents)} vs Credits{" "}
              {formatCents(analysis.totalCreditsCents)}
              {!analysis.balanced &&
                ` · difference ${formatCents(Math.abs(analysis.differenceCents))}`}
            </span>
          </div>
          {!analysis.balanced && (
            <p className="text-sm text-muted-foreground">
              You can still import — any difference will be posted to{" "}
              <span className="font-medium">Opening Balance Equity</span> so the ledger stays
              balanced.
            </p>
          )}

          {invalidRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> {invalidRows.length} rows
                  have errors
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm max-h-48 overflow-auto">
                {invalidRows.slice(0, 50).map((r) => (
                  <div key={r.rowIndex} className="flex gap-3">
                    <span className="text-muted-foreground w-16 shrink-0">Row {r.rowIndex}</span>
                    <span className="text-destructive">{r.errors.join("; ")}</span>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="mt-2" onClick={downloadErrorReport}>
                  <Download className="h-4 w-4 mr-1" /> Download error report
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button disabled={review.length === 0} onClick={() => setStep(4)}>
              Review accounts <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4 — Review */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Stat label="Accounts" value={String(summary.count)} />
            <Stat label="To create" value={String(summary.create)} tone="good" />
            <Stat label="To match" value={String(summary.match)} />
            <Stat label="Total debits" value={formatCents(summary.debits)} />
            <Stat label="Total credits" value={formatCents(summary.credits)} />
          </div>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">Accounts to import</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-32">Type</TableHead>
                    <TableHead className="w-40">Detail type</TableHead>
                    <TableHead className="text-right w-28">Debit</TableHead>
                    <TableHead className="text-right w-28">Credit</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                    <TableHead className="text-right w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {review.map((r, i) => {
                    const isEditing = editing === i;
                    return (
                      <TableRow key={i} className={r.include ? "" : "opacity-40"}>
                        {isEditing ? (
                          <>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {r.accountNumber}
                            </TableCell>
                            <TableCell>
                              <Input
                                className="h-8"
                                value={r.accountName}
                                onChange={(e) =>
                                  setReview((rs) =>
                                    rs.map((x, idx) =>
                                      idx === i ? { ...x, accountName: e.target.value } : x,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                className="h-8"
                                value={r.accountType}
                                onChange={(e) =>
                                  setReview((rs) =>
                                    rs.map((x, idx) =>
                                      idx === i
                                        ? {
                                            ...x,
                                            accountType: e.target.value,
                                            subtype: defaultSubtypeFor(e.target.value),
                                          }
                                        : x,
                                    ),
                                  )
                                }
                              >
                                {ACCOUNT_TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </Select>
                            </TableCell>
                            <TableCell>{detailTypeCell(r, i, setReview)}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                className="h-8 w-24 text-right"
                                defaultValue={r.debitCents ? (r.debitCents / 100).toFixed(2) : ""}
                                onChange={(e) => {
                                  const c = Math.round(parseFloat(e.target.value) * 100);
                                  setReview((rs) =>
                                    rs.map((x, idx) =>
                                      idx === i
                                        ? {
                                            ...x,
                                            debitCents: isNaN(c) ? 0 : c,
                                            creditCents: isNaN(c) || c === 0 ? x.creditCents : 0,
                                          }
                                        : x,
                                    ),
                                  );
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                className="h-8 w-24 text-right"
                                defaultValue={r.creditCents ? (r.creditCents / 100).toFixed(2) : ""}
                                onChange={(e) => {
                                  const c = Math.round(parseFloat(e.target.value) * 100);
                                  setReview((rs) =>
                                    rs.map((x, idx) =>
                                      idx === i
                                        ? {
                                            ...x,
                                            creditCents: isNaN(c) ? 0 : c,
                                            debitCents: isNaN(c) || c === 0 ? x.debitCents : 0,
                                          }
                                        : x,
                                    ),
                                  );
                                }}
                              />
                            </TableCell>
                            <TableCell colSpan={2} className="text-right">
                              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                                Done
                              </Button>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {r.accountNumber}
                            </TableCell>
                            <TableCell className="font-medium">
                              {r.accountName}
                              {r.status === "match" &&
                                r.existingName &&
                                r.existingName !== r.accountName && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    (was: {r.existingName})
                                  </span>
                                )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {r.accountType}
                              </Badge>
                            </TableCell>
                            <TableCell>{detailTypeCell(r, i, setReview)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.debitCents ? formatCents(r.debitCents) : ""}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.creditCents ? formatCents(r.creditCents) : ""}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={r.status === "create" ? "default" : "secondary"}
                                className="text-xs"
                              >
                                {r.status === "create" ? "New" : "Match"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => setEditing(i)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() =>
                                  setReview((rs) =>
                                    rs.map((x, idx) =>
                                      idx === i ? { ...x, include: !x.include } : x,
                                    ),
                                  )
                                }
                              >
                                {r.include ? (
                                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ArrowRight className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-amber-300 bg-amber-50/50">
            <CardContent className="space-y-3 pt-6">
              <p className="flex items-center gap-2 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4" /> This imports opening balances as of{" "}
                {effectiveDate} and locks the import for audit.
              </p>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I confirm this trial balance is correct.
              </label>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)}>
              Back
            </Button>
            <Button
              disabled={!confirmed || summary.count === 0 || commit.isPending}
              onClick={() => {
                setStep(5);
                commit.mutate();
              }}
            >
              Import {summary.count} accounts
            </Button>
          </div>
        </div>
      )}

      {/* STEP 5 — Processing */}
      {step === 5 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm font-medium">Importing trial balance…</p>
            <div className="mt-4 h-2 w-64 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 6 — Done */}
      {step === 6 && result && (
        <div className="space-y-6">
          <Card
            className={
              result.balanced
                ? "border-green-300 bg-green-50/50"
                : "border-amber-300 bg-amber-50/50"
            }
          >
            <CardContent className="flex items-center gap-3 pt-6">
              {result.balanced ? (
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              ) : (
                <AlertTriangle className="h-8 w-8 text-amber-600" />
              )}
              <div>
                <div className="text-lg font-bold">Import complete</div>
                <p className="text-sm text-muted-foreground">
                  {result.accountsCreated} created · {result.accountsMatched} matched ·{" "}
                  {result.accountsSkipped} skipped · {result.failed} failed
                  {result.balanced ? " · balanced ✓" : " · plugged to Opening Balance Equity"}
                </p>
              </div>
            </CardContent>
          </Card>

          {result.failed > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" /> {result.failed} failed
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {result.failures.map((f, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-muted-foreground w-16">Row {f.index + 1}</span>
                    <span className="text-destructive">{f.reason}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/trial-balance">View trial balance</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/general-ledger">View general ledger</Link>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStep(1);
                setHeaders([]);
                setRawRows([]);
                setReview([]);
                setAnalysis(null);
                setResult(null);
                setConfirmed(false);
                setFileName("");
                setProgress(0);
              }}
            >
              Import another
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// Detail-type picker for the Review table. New accounts get an inline dropdown so
// banks/credit cards can be flagged without entering edit mode; matched accounts keep
// their existing subtype on the server, so we just show a placeholder.
function detailTypeCell(r: ReviewRow, i: number, setReview: Dispatch<SetStateAction<ReviewRow[]>>) {
  if (r.status !== "create") return <span className="text-muted-foreground">—</span>;
  const options = DETAIL_TYPES[r.accountType] ?? [];
  return (
    <Select
      className="h-8"
      value={r.subtype}
      onChange={(e) =>
        setReview((rs) => rs.map((x, idx) => (idx === i ? { ...x, subtype: e.target.value } : x)))
      }
    >
      {options.map((d) => (
        <option key={d.value} value={d.value}>
          {d.label}
        </option>
      ))}
    </Select>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  const color = tone === "good" ? "text-green-600" : tone === "warn" ? "text-amber-600" : "";
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
