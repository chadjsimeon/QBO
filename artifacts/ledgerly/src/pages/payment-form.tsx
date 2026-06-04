import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, toDateInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface Customer { id: string; name: string; }
interface Vendor { id: string; name: string; }

const METHODS = ["BANK_TRANSFER", "CHECK", "CREDIT_CARD", "CASH", "OTHER"];

export default function PaymentFormPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [direction, setDirection] = useState<"RECEIVED" | "SENT">("RECEIVED");
  const [contactId, setContactId] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [date, setDate] = useState(toDateInput(new Date()));
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [memo, setMemo] = useState("");

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => apiFetch<Customer[]>("/customers") });
  const { data: vendors = [] } = useQuery({ queryKey: ["vendors"], queryFn: () => apiFetch<Vendor[]>("/vendors") });

  const contacts = direction === "RECEIVED" ? customers : vendors;
  const contactLabel = direction === "RECEIVED" ? "Customer" : "Vendor";

  const saveMutation = useMutation({
    mutationFn: () => {
      const amountCents = Math.round(parseFloat(amountStr) * 100);
      const body: Record<string, unknown> = {
        direction,
        amountCents,
        date,
        method,
        memo: memo || undefined,
      };
      if (direction === "RECEIVED") body.customerId = contactId || undefined;
      else body.vendorId = contactId || undefined;
      return apiFetch("/payments", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast({ title: "Payment recorded" });
      navigate("/payments");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <div className="mb-6">
        <Link href="/payments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-3 w-3" /> Back to payments
        </Link>
        <h1 className="text-2xl font-bold">New payment</h1>
      </div>

      <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-6 max-w-lg">
        <Card>
          <CardHeader><CardTitle>Payment details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="direction">Direction *</Label>
              <Select id="direction" value={direction} onChange={e => { setDirection(e.target.value as "RECEIVED" | "SENT"); setContactId(""); }}>
                <option value="RECEIVED">Received (from customer)</option>
                <option value="SENT">Sent (to vendor)</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact">{contactLabel}</Label>
              <Select id="contact" value={contactId} onChange={e => setContactId(e.target.value)}>
                <option value="">None</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (USD) *</Label>
              <Input id="amount" type="number" min="0" step="0.01" placeholder="0.00"
                value={amountStr} onChange={e => setAmountStr(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="method">Method</Label>
              <Select id="method" value={method} onChange={e => setMethod(e.target.value)}>
                {METHODS.map(m => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="memo">Memo</Label>
              <Input id="memo" placeholder="Optional note…" value={memo} onChange={e => setMemo(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <Link href="/payments">Cancel</Link>
          </Button>
          <Button type="submit" disabled={saveMutation.isPending || !amountStr}>
            {saveMutation.isPending ? "Saving…" : "Record payment"}
          </Button>
        </div>
      </form>
    </>
  );
}
