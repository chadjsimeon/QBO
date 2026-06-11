import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { apiFetch, formatCents, toDateInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}
interface JeLine {
  accountId: string;
  debitCents: number;
  creditCents: number;
}

const EMPTY: JeLine = { accountId: "", debitCents: 0, creditCents: 0 };

export default function JournalEntryFormPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [date, setDate] = useState(toDateInput(new Date()));
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<JeLine[]>([{ ...EMPTY }, { ...EMPTY }]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetch<Account[]>("/accounts"),
  });
  const postable = accounts.filter((a) => a.type !== undefined);

  const totalDebits = lines.reduce((s, l) => s + (l.debitCents || 0), 0);
  const totalCredits = lines.reduce((s, l) => s + (l.creditCents || 0), 0);
  const balanced = totalDebits === totalCredits && totalDebits > 0;
  const filled = lines.filter((l) => l.accountId && (l.debitCents || l.creditCents)).length;

  const updateLine = (i: number, patch: Partial<JeLine>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { ...EMPTY }]);
  const removeLine = (i: number) =>
    setLines((ls) => (ls.length > 2 ? ls.filter((_, idx) => idx !== i) : ls));

  const save = useMutation({
    mutationFn: () =>
      apiFetch("/journal-entries", {
        method: "POST",
        body: JSON.stringify({
          date,
          memo,
          lines: lines
            .filter((l) => l.accountId && (l.debitCents || l.creditCents))
            .map((l) => ({
              accountId: l.accountId,
              debitCents: l.debitCents || 0,
              creditCents: l.creditCents || 0,
            })),
        }),
      }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      toast({ title: "Journal entry posted" });
      navigate(`/journal-entries/${data.id}`);
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="mb-6">
        <Link
          href="/journal-entries"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to journal entries
        </Link>
        <h1 className="text-2xl font-bold">New journal entry</h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memo">Memo</Label>
              <Input
                id="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Description"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Lines</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" /> Add line
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground">
              <div className="col-span-6">Account</div>
              <div className="col-span-3 text-right">Debit (cents)</div>
              <div className="col-span-2 text-right">Credit (cents)</div>
              <div className="col-span-1" />
            </div>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-6">
                  <Select
                    value={line.accountId}
                    onChange={(e) => updateLine(i, { accountId: e.target.value })}
                  >
                    <option value="">Select account…</option>
                    {postable.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="col-span-3">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    className="text-right"
                    value={line.debitCents || ""}
                    onChange={(e) =>
                      updateLine(i, { debitCents: parseInt(e.target.value) || 0, creditCents: 0 })
                    }
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    className="text-right"
                    value={line.creditCents || ""}
                    onChange={(e) =>
                      updateLine(i, { creditCents: parseInt(e.target.value) || 0, debitCents: 0 })
                    }
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  {lines.length > 2 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            <div className="grid grid-cols-12 gap-2 border-t pt-3 text-sm font-medium">
              <div className="col-span-6 text-right text-muted-foreground">Totals</div>
              <div className="col-span-3 text-right tabular-nums">{formatCents(totalDebits)}</div>
              <div className="col-span-2 text-right tabular-nums">{formatCents(totalCredits)}</div>
              <div className="col-span-1" />
            </div>
            <div className="flex justify-end text-sm">
              {balanced ? (
                <span className="text-green-600 font-medium">Balanced</span>
              ) : (
                <span className="text-muted-foreground">
                  Difference: {formatCents(Math.abs(totalDebits - totalCredits))}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <Link href="/journal-entries">Cancel</Link>
          </Button>
          <Button type="submit" disabled={save.isPending || !balanced || filled < 2}>
            {save.isPending ? "Posting…" : "Post entry"}
          </Button>
        </div>
      </form>
    </>
  );
}
