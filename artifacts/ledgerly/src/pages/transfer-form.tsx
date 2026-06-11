import { useState } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
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
  subtype?: string;
  systemRole?: string | null;
}

const isBank = (a: Account) => a.subtype === "bank" || a.systemRole === "CASH";
const isCard = (a: Account) => a.subtype === "credit_card";
const isMoney = (a: Account) => isBank(a) || isCard(a);

export default function TransferFormPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const ccMode = new URLSearchParams(search).get("mode") === "cc";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [date, setDate] = useState(toDateInput(new Date()));
  const [fromAccountId, setFrom] = useState("");
  const [toAccountId, setTo] = useState("");
  const [amountCents, setAmount] = useState(0);
  const [memo, setMemo] = useState("");

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetch<Account[]>("/accounts"),
  });

  const fromOptions = accounts.filter(ccMode ? isBank : isMoney);
  const toOptions = accounts.filter(ccMode ? isCard : isMoney);

  const save = useMutation({
    mutationFn: () =>
      apiFetch("/transfers", {
        method: "POST",
        body: JSON.stringify({ date, fromAccountId, toAccountId, amountCents, memo }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast({ title: ccMode ? "Credit card payment recorded" : "Transfer recorded" });
      navigate("/dashboard");
    },
    onError: (e: Error) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const valid = fromAccountId && toAccountId && fromAccountId !== toAccountId && amountCents > 0;

  return (
    <>
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </Link>
        <h1 className="text-2xl font-bold">{ccMode ? "Pay down credit card" : "Transfer funds"}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ccMode
            ? "Pay a credit card balance from a bank account."
            : "Move money between two of your accounts."}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
        className="space-y-6 max-w-2xl"
      >
        <Card>
          <CardHeader>
            <CardTitle>{ccMode ? "Payment" : "Transfer"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
              <div className="space-y-2">
                <Label>{ccMode ? "Pay from (bank)" : "From account"} *</Label>
                <Select value={fromAccountId} onChange={(e) => setFrom(e.target.value)} required>
                  <option value="">Select…</option>
                  {fromOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="hidden sm:flex items-center justify-center pb-2 text-muted-foreground">
                <ArrowRight className="h-4 w-4" />
              </div>
              <div className="space-y-2">
                <Label>{ccMode ? "Credit card" : "To account"} *</Label>
                <Select value={toAccountId} onChange={(e) => setTo(e.target.value)} required>
                  <option value="">Select…</option>
                  {toOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (cents) *</Label>
                <Input
                  id="amount"
                  type="number"
                  min={1}
                  step={1}
                  value={amountCents || ""}
                  onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
                  required
                />
                {amountCents > 0 && (
                  <p className="text-xs text-muted-foreground">{formatCents(amountCents)}</p>
                )}
              </div>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="memo">Memo</Label>
              <Input
                id="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Optional note"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 max-w-2xl">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard">Cancel</Link>
          </Button>
          <Button type="submit" disabled={save.isPending || !valid}>
            {save.isPending ? "Recording…" : ccMode ? "Record payment" : "Record transfer"}
          </Button>
        </div>
      </form>
    </>
  );
}
