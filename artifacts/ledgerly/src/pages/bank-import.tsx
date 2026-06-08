import { useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import Papa from "papaparse";
import {
  ArrowLeft, ArrowRight, UploadCloud, FileText, CheckCircle2, AlertTriangle,
  Pencil, Trash2, X, Download, Loader2,
} from "lucide-react";
import { apiFetch, formatCents, formatDate, toDateInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  autodetectMapping, buildRows, REQUIRED_FIELDS, OPTIONAL_FIELDS, FIELD_LABELS,
  type FieldKey, type DateFormat, type MappedRow,
} from "@/lib/csv-import";

interface BankAccount { id: string; accountId: string; institutionName: string; accountMask: string | null; accountName: string | null; }
interface CoaBankAccount { id: string; code: string; name: string; subtype: string; }
interface MatchInfo { kind: "invoice" | "bill"; id: string; number: string; label: string; confidence: number }
interface AnalyzeRow { index: number; isDuplicate: boolean; duplicateOfId: string | null; match: MatchInfo | null }

// One reviewable transaction (a valid mapped row enriched with analysis + user edits).
interface ReviewTxn extends MappedRow {
  include: boolean;
  isDuplicate: boolean;
  match: MatchInfo | null;
  acceptMatch: boolean;
}

const STEPS = ["Upload", "Map columns", "Validate", "Match", "Review", "Import", "Done"];
const MAX_BYTES = 25 * 1024 * 1024;

export default function BankImportPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const { data: bankAccounts = [] } = useQuery({ queryKey: ["bank-accounts"], queryFn: () => apiFetch<BankAccount[]>("/bank-accounts") });
  const { data: unlinkedAccounts = [] } = useQuery({ queryKey: ["bank-accounts-unlinked"], queryFn: () => apiFetch<CoaBankAccount[]>("/bank-accounts/unlinked") });

  // Combined dropdown options: connected accounts (bank_accounts.id as value) + unlinked CoA accounts (accounts.id prefixed)
  const dropdownOptions = useMemo(() => [
    ...bankAccounts.map(b => ({ value: `linked:${b.id}`, label: `${b.institutionName}${b.accountMask ? ` ···${b.accountMask}` : ""}${b.accountName ? ` — ${b.accountName}` : ""}` })),
    ...unlinkedAccounts.map(u => ({ value: `coa:${u.id}`, label: `${u.name} (${u.code})` })),
  ], [bankAccounts, unlinkedAccounts]);

  const [selectedOption, setSelectedOption] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({ date: "", amount: "", description: "", reference: "", payee: "", type: "", category: "" });
  const [dateFormat, setDateFormat] = useState<DateFormat>("AUTO");

  const [review, setReview] = useState<ReviewTxn[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ batchId: string; imported: number; skipped: number; failed: number; failures: { index: number; reason: string }[]; transactions: any[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const mapped = useMemo(() => buildRows(rows, mapping, dateFormat), [rows, mapping, dateFormat]);
  const validRows = useMemo(() => mapped.filter((m) => m.errors.length === 0), [mapped]);
  const invalidRows = useMemo(() => mapped.filter((m) => m.errors.length > 0), [mapped]);

  // ── File handling ─────────────────────────────────────────────────────────
  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      toast({ title: "Invalid file", description: "Please upload a .csv file.", variant: "destructive" }); return;
    }
    if (file.size > MAX_BYTES) {
      toast({ title: "File too large", description: "Maximum file size is 25MB.", variant: "destructive" }); return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: "greedy",
      complete: (res) => {
        const flds = (res.meta.fields ?? []).filter(Boolean);
        if (flds.length === 0 || res.data.length === 0) {
          toast({ title: "Empty file", description: "No header row or rows detected.", variant: "destructive" }); return;
        }
        setFileName(file.name);
        setHeaders(flds);
        setRows(res.data);
        setMapping(autodetectMapping(flds));
        setStep(2);
      },
      error: (err) => toast({ title: "Parse error", description: err.message, variant: "destructive" }),
    });
  }

  // ── Step transitions ──────────────────────────────────────────────────────
  const analyze = useMutation({
    mutationFn: async () => {
      // Auto-connect CoA bank accounts that haven't been connected yet
      let resolvedId = bankAccountId;
      if (!resolvedId && selectedOption.startsWith("coa:")) {
        const coaId = selectedOption.slice(4);
        const ensured = await apiFetch<BankAccount>("/bank-accounts/ensure", { method: "POST", body: JSON.stringify({ accountId: coaId }) });
        resolvedId = ensured.id;
        setBankAccountId(resolvedId);
      }
      return apiFetch<{ results: AnalyzeRow[]; duplicateCount: number; matchCount: number }>(`/bank-accounts/${resolvedId}/import/analyze`, {
        method: "POST",
        body: JSON.stringify({ transactions: validRows.map((r) => ({ date: r.date!.toISOString(), amountCents: r.amountCents, description: r.description })) }),
      });
    },
    onSuccess: (data) => {
      const byIndex = new Map(data.results.map((r) => [r.index, r]));
      setReview(validRows.map((r, i) => {
        const a = byIndex.get(i);
        return { ...r, include: true, isDuplicate: !!a?.isDuplicate, match: a?.match ?? null, acceptMatch: (a?.match?.confidence ?? 0) >= 0.8 };
      }));
      setStep(3);
    },
    onError: (e: Error) => toast({ title: "Analysis failed", description: e.message, variant: "destructive" }),
  });

  const commit = useMutation({
    mutationFn: () => {
      setProgress(15);
      const txns = review.filter((r) => r.include).map((r) => ({
        date: r.date!.toISOString(), amountCents: r.amountCents, description: r.description,
        referenceNumber: r.referenceNumber || undefined, payeeName: r.payeeName || undefined,
        matchedInvoiceId: r.acceptMatch && r.match?.kind === "invoice" ? r.match.id : undefined,
        matchedBillId: r.acceptMatch && r.match?.kind === "bill" ? r.match.id : undefined,
        isDuplicate: r.isDuplicate,
      }));
      setProgress(45);
      return apiFetch<typeof result>(`/bank-accounts/${bankAccountId}/import/commit`, {
        method: "POST", body: JSON.stringify({ fileName, skipDuplicates, transactions: txns }),
      });
    },
    onSuccess: (data) => { setProgress(100); setResult(data); setStep(7); },
    onError: (e: Error) => { setProgress(0); setStep(5); toast({ title: "Import failed", description: e.message, variant: "destructive" }); },
  });

  // ── Review summary ────────────────────────────────────────────────────────
  const included = review.filter((r) => r.include);
  const summary = useMemo(() => {
    const dates = included.map((r) => r.date!.getTime());
    const deposits = included.filter((r) => (r.amountCents ?? 0) > 0).reduce((s, r) => s + r.amountCents!, 0);
    const payments = included.filter((r) => (r.amountCents ?? 0) < 0).reduce((s, r) => s + Math.abs(r.amountCents!), 0);
    const dupSkip = skipDuplicates ? included.filter((r) => r.isDuplicate).length : 0;
    return {
      count: included.length,
      from: dates.length ? new Date(Math.min(...dates)) : null,
      to: dates.length ? new Date(Math.max(...dates)) : null,
      deposits, payments, net: deposits - payments, dupSkip,
    };
  }, [included, skipDuplicates]);

  const selectedAccount = bankAccounts.find((b) => b.id === bankAccountId)
    ?? (selectedOption.startsWith("coa:") ? unlinkedAccounts.find(u => u.id === selectedOption.slice(4)) : undefined);

  function downloadErrorReport() {
    const lines = ["row,reason", ...invalidRows.map((r) => `${r.rowIndex},"${r.errors.join("; ")}"`)];
    if (result) lines.push(...result.failures.map((f) => `${f.index + 1},"${f.reason}"`));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "import-errors.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="mb-6">
        <Link href="/banking" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"><ArrowLeft className="h-3 w-3" /> Back to banking</Link>
        <h1 className="text-2xl font-bold">Import bank transactions</h1>
      </div>

      {/* Stepper */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
        {STEPS.map((label, i) => {
          const n = i + 1;
          return (
            <div key={label} className="flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${n < step ? "bg-primary text-primary-foreground" : n === step ? "bg-primary/15 text-primary ring-1 ring-primary" : "bg-muted text-muted-foreground"}`}>{n < step ? "✓" : n}</span>
              <span className={n === step ? "font-medium" : "text-muted-foreground"}>{label}</span>
              {n < STEPS.length && <span className="text-muted-foreground">→</span>}
            </div>
          );
        })}
      </div>

      {/* STEP 1 — Upload */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Upload a CSV file with your bank transactions</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-md space-y-2">
              <Label>Import into bank account *</Label>
              <Select value={selectedOption} onChange={(e) => { const v = e.target.value; setSelectedOption(v); setBankAccountId(v.startsWith("linked:") ? v.slice(7) : ""); }}>
                <option value="">Select account…</option>
                {dropdownOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </Select>
              {dropdownOptions.length === 0 && <p className="text-xs text-muted-foreground">No bank accounts yet. Create one in Chart of Accounts first.</p>}
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!selectedOption) { toast({ title: "Pick an account first", variant: "destructive" }); return; } const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-14 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"} ${!selectedOption ? "opacity-60" : ""}`}
            >
              <UploadCloud className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Drag &amp; drop your .csv here</p>
              <p className="text-xs text-muted-foreground">or</p>
              <Button className="mt-2" variant="outline" disabled={!selectedOption} onClick={() => fileRef.current?.click()}>Choose file</Button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
              <p className="mt-3 text-xs text-muted-foreground">CSV only · up to 25MB · first row should be column headers</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2 — Column mapping */}
      {step === 2 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Map your columns</CardTitle>
              <p className="text-sm text-muted-foreground">{rows.length} rows detected · {headers.length} columns · <span className="font-medium">{fileName}</span></p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].map((field) => {
                  const required = REQUIRED_FIELDS.includes(field);
                  const sample = mapping[field] ? (rows.find((r) => r[mapping[field]])?.[mapping[field]] ?? "") : "";
                  return (
                    <div key={field} className="space-y-1">
                      <Label className="text-xs">{FIELD_LABELS[field]} {required && <span className="text-destructive">*</span>}</Label>
                      <Select value={mapping[field]} onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}>
                        <option value="">— not mapped —</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </Select>
                      {sample && <p className="truncate text-[11px] text-muted-foreground">e.g. {sample}</p>}
                    </div>
                  );
                })}
                <div className="space-y-1">
                  <Label className="text-xs">Date format</Label>
                  <Select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
                    <option value="AUTO">Auto-detect</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader><CardTitle className="text-base">Preview · first 10 rows</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow>{headers.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  {rows.slice(0, 10).map((r, i) => <TableRow key={i}>{headers.map((h) => <TableCell key={h} className="whitespace-nowrap text-muted-foreground">{r[h]}</TableCell>)}</TableRow>)}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button disabled={!REQUIRED_FIELDS.every((f) => mapping[f]) || validRows.length === 0 || analyze.isPending} onClick={() => analyze.mutate()}>
              {analyze.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Checking…</> : <>Validate &amp; check duplicates <ArrowRight className="h-4 w-4 ml-1" /></>}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3 — Validation & duplicates */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Rows in file" value={String(mapped.length)} />
            <StatCard label="Valid" value={String(validRows.length)} tone="good" />
            <StatCard label="Invalid (skipped)" value={String(invalidRows.length)} tone={invalidRows.length ? "warn" : undefined} />
            <StatCard label="Potential duplicates" value={String(review.filter((r) => r.isDuplicate).length)} tone={review.some((r) => r.isDuplicate) ? "warn" : undefined} />
          </div>

          {invalidRows.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> {invalidRows.length} rows have validation errors</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm max-h-48 overflow-auto">
                {invalidRows.slice(0, 50).map((r) => <div key={r.rowIndex} className="flex gap-3"><span className="text-muted-foreground w-16 shrink-0">Row {r.rowIndex}</span><span className="text-destructive">{r.errors.join("; ")}</span></div>)}
                <p className="pt-2 text-xs text-muted-foreground">Invalid rows are excluded from the import. Go back to fix the mapping/date format, or download a report.</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={downloadErrorReport}><Download className="h-4 w-4 mr-1" /> Download error report</Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <div className="font-medium text-sm">Duplicate handling</div>
                <p className="text-xs text-muted-foreground">Matched on Date + Amount + Description against existing transactions.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} className="h-4 w-4" />
                Skip {review.filter((r) => r.isDuplicate).length} duplicates
              </label>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button disabled={validRows.length === 0} onClick={() => setStep(4)}>Continue to matching <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </div>
      )}

      {/* STEP 4 — Matching */}
      {step === 4 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Match to invoices &amp; bills</CardTitle>
              <p className="text-sm text-muted-foreground">{review.filter((r) => r.match).length} suggestion(s) found. Deposits match open invoices; payments match open bills.</p>
            </CardHeader>
            <CardContent className="p-0">
              {review.filter((r) => r.match).length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No suggested matches. You can categorize these later from the Banking review screen.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Suggested match</TableHead><TableHead>Confidence</TableHead><TableHead className="text-right">Accept</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {review.map((r, i) => r.match && (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">{formatDate(r.date!)}</TableCell>
                        <TableCell className="max-w-[16rem] truncate">{r.description}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCents(Math.abs(r.amountCents!))}</TableCell>
                        <TableCell>{r.match.kind === "invoice" ? "Invoice " : "Bill "}{r.match.label}</TableCell>
                        <TableCell><Badge variant={r.match.confidence >= 0.8 ? "default" : "secondary"}>{Math.round(r.match.confidence * 100)}%</Badge></TableCell>
                        <TableCell className="text-right"><input type="checkbox" className="h-4 w-4" checked={r.acceptMatch} onChange={(e) => setReview((rs) => rs.map((x, idx) => idx === i ? { ...x, acceptMatch: e.target.checked } : x))} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
            <Button onClick={() => setStep(5)}>Review import <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </div>
      )}

      {/* STEP 5 — Review & confirm */}
      {step === 5 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Transactions" value={String(summary.count)} />
            <StatCard label="Date range" value={summary.from ? `${formatDate(summary.from)} – ${formatDate(summary.to!)}` : "—"} small />
            <StatCard label="Deposits" value={formatCents(summary.deposits)} tone="good" />
            <StatCard label="Payments" value={formatCents(summary.payments)} tone="warn" />
            <StatCard label="Net change" value={formatCents(summary.net)} />
            <StatCard label="Duplicates to skip" value={String(summary.dupSkip)} />
          </div>

          <Card className="overflow-hidden">
            <CardHeader><CardTitle className="text-base">All transactions to import</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead>
                  <TableHead>Description</TableHead><TableHead>Reference</TableHead><TableHead>Payee</TableHead>
                  <TableHead>Matched</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {review.map((r, i) => {
                    const deposit = (r.amountCents ?? 0) > 0;
                    const isEditing = editing === i;
                    return (
                      <TableRow key={i} className={r.include ? "" : "opacity-40"}>
                        {isEditing ? (
                          <>
                            <TableCell><Input type="date" className="h-8 w-36" value={r.date ? toDateInput(r.date) : ""} onChange={(e) => setReview((rs) => rs.map((x, idx) => idx === i ? { ...x, date: e.target.value ? new Date(e.target.value + "T00:00:00") : x.date } : x))} /></TableCell>
                            <TableCell colSpan={2}><Input type="number" step="0.01" className="h-8 w-28 text-right" defaultValue={(r.amountCents! / 100).toFixed(2)} onChange={(e) => { const c = Math.round(parseFloat(e.target.value) * 100); setReview((rs) => rs.map((x, idx) => idx === i ? { ...x, amountCents: isNaN(c) ? x.amountCents : c } : x)); }} /></TableCell>
                            <TableCell><Input className="h-8" value={r.description} onChange={(e) => setReview((rs) => rs.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} /></TableCell>
                            <TableCell><Input className="h-8 w-24" value={r.referenceNumber} onChange={(e) => setReview((rs) => rs.map((x, idx) => idx === i ? { ...x, referenceNumber: e.target.value } : x))} /></TableCell>
                            <TableCell><Input className="h-8 w-28" value={r.payeeName} onChange={(e) => setReview((rs) => rs.map((x, idx) => idx === i ? { ...x, payeeName: e.target.value } : x))} /></TableCell>
                            <TableCell />
                            <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Done</Button></TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="text-muted-foreground whitespace-nowrap">{r.date ? formatDate(r.date) : "—"}</TableCell>
                            <TableCell><Badge variant={deposit ? "default" : "secondary"}>{deposit ? "Deposit" : "Payment"}</Badge></TableCell>
                            <TableCell className={`text-right tabular-nums ${deposit ? "text-green-600" : ""}`}>{deposit ? "+" : "−"}{formatCents(Math.abs(r.amountCents ?? 0))}</TableCell>
                            <TableCell className="max-w-[16rem] truncate">{r.description}{r.isDuplicate && <Badge variant="secondary" className="ml-2">dup</Badge>}</TableCell>
                            <TableCell className="text-muted-foreground">{r.referenceNumber || "—"}</TableCell>
                            <TableCell className="text-muted-foreground">{r.payeeName || "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{r.acceptMatch && r.match ? r.match.label : "—"}</TableCell>
                            <TableCell className="text-right">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(i)}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setReview((rs) => rs.map((x, idx) => idx === i ? { ...x, include: !x.include } : x))}>{r.include ? <Trash2 className="h-3.5 w-3.5 text-muted-foreground" /> : <ArrowRight className="h-3.5 w-3.5" />}</Button>
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
              <p className="flex items-center gap-2 text-sm text-amber-800"><AlertTriangle className="h-4 w-4" /> These transactions will be imported to your account.</p>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="h-4 w-4" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                I have reviewed these transactions and confirm they are correct.
              </label>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>Adjust mapping</Button>
              <Button variant="ghost" onClick={() => navigate("/banking")}><X className="h-4 w-4 mr-1" /> Cancel import</Button>
            </div>
            <Button disabled={!confirmed || summary.count === 0} onClick={() => { setStep(6); commit.mutate(); }}>Import {summary.count} transactions</Button>
          </div>
        </div>
      )}

      {/* STEP 6 — Processing */}
      {step === 6 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm font-medium">Importing transactions…</p>
            <div className="mt-4 h-2 w-64 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 7 — Completion */}
      {step === 7 && result && (
        <div className="space-y-6">
          <Card className="border-green-300 bg-green-50/50">
            <CardContent className="flex items-center gap-3 pt-6">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <div className="text-lg font-bold">Import complete</div>
                <p className="text-sm text-muted-foreground">{result.imported} imported · {result.skipped} duplicates skipped · {result.failed} failed</p>
              </div>
            </CardContent>
          </Card>

          {result.failed > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> {result.failed} failed to import</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {result.failures.map((f, i) => <div key={i} className="flex gap-3"><span className="text-muted-foreground w-16">Row {f.index + 1}</span><span className="text-destructive">{f.reason}</span></div>)}
                <Button variant="outline" size="sm" className="mt-2" onClick={downloadErrorReport}><Download className="h-4 w-4 mr-1" /> Download error report</Button>
              </CardContent>
            </Card>
          )}

          {result.transactions.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader><CardTitle className="text-base">Imported transactions (Pending review)</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Reference</TableHead><TableHead>Payee</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {result.transactions.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-muted-foreground">{formatDate(t.date)}</TableCell>
                        <TableCell>{t.descriptionRaw}</TableCell>
                        <TableCell className="text-muted-foreground">{t.referenceNumber || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{t.payeeName || "—"}</TableCell>
                        <TableCell className={`text-right tabular-nums ${t.amountCents > 0 ? "text-green-600" : ""}`}>{t.amountCents > 0 ? "+" : "−"}{formatCents(Math.abs(t.amountCents))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button asChild><Link href={bankAccountId ? `/banking/${bankAccountId}` : "/banking"}>Review &amp; categorize</Link></Button>
            <Button variant="outline" onClick={() => { setStep(1); setHeaders([]); setRows([]); setReview([]); setResult(null); setConfirmed(false); setFileName(""); setProgress(0); }}>Import another file</Button>
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({ label, value, tone, small }: { label: string; value: string; tone?: "good" | "warn"; small?: boolean }) {
  const color = tone === "good" ? "text-green-600" : tone === "warn" ? "text-amber-600" : "";
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 font-bold tabular-nums ${small ? "text-sm" : "text-xl"} ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
