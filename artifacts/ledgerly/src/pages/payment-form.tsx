import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, formatCents, toDateInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface Customer { id: string; name: string; }
interface Vendor { id: string; name: string; }
interface OpenInvoice { id: string; number: string; balanceCents: number; dueDate: string; }
interface OpenBill { id: string; number: string; balanceCents: number; dueDate: string; }

interface Allocation { docId: string; label: string; maxCents: number; amountCents: number; }

const METHODS = ["BANK_TRANSFER", "CHECK", "CREDIT_CARD", "CASH", "OTHER"];

export default function PaymentFormPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [direction, setDirection] = useState<"RECEIVED" | "SENT">("RECEIVED");
  const [contactId, setContactId] = useState("");
  const [date, setDate] = useState(toDateInput(new Date()));
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [memo, setMemo] = useState("");
  const [allocations, setAllocations] = useState<Allocation[]>([]);

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => apiFetch<Customer[]>("/customers") });
  const { data: vendors = [] } = useQuery({ queryKey: ["vendors"], queryFn: () => apiFetch<Vendor[]>("/vendors") });

  const contacts = direction === "RECEIVED" ? customers : vendors;
  const contactLabel = direction === "RECEIVED" ? "Customer" : "Vendor";

  const { data: openInvoices = [] } = useQuery<OpenInvoice[]>({
    queryKey: ["open-invoices", contactId],
    queryFn: () => apiFetch<OpenInvoice[]>(`/payments/open-invoices/${contactId}`),
    enabled: direction === "RECEIVED" && !!contactId,
  });

  const { data: openBills = [] } = useQuery<OpenBill[]>({
    queryKey: ["open-bills", contactId],
    queryFn: () => apiFetch<OpenBill[]>(`/payments/open-bills/${contactId}`),
    enabled: direction === "SENT" && !!contactId,
  });

  const availableDocs = (direction === "RECEIVED" ? openInvoices : openBills) as Array<{ id: string; number: string; balanceCents: number; dueDate: string }>;
  const allocatedIds = new Set(allocations.map(a => a.docId));
  const unallocatedDocs = availableDocs.filter(d => !allocatedIds.has(d.id));

  const totalAllocatedCents = allocations.reduce((s, a) => s + a.amountCents, 0);

  function addAllocation(doc: { id: string; number: string; balanceCents: number }) {
    setAllocations(prev => [...prev, { docId: doc.id, label: doc.number, maxCents: doc.balanceCents, amountCents: doc.balanceCents }]);
  }

  function updateAllocationAmount(docId: string, cents: number) {
    setAllocations(prev => prev.map(a => a.docId === docId ? { ...a, amountCents: Math.min(cents, a.maxCents) } : a));
  }

  function removeAllocation(docId: string) {
    setAllocations(prev => prev.filter(a => a.docId !== docId));
  }

  function handleDirectionChange(newDir: "RECEIVED" | "SENT") {
    setDirection(newDir);
    setContactId("");
    setAllocations([]);
  }

  function handleContactChange(id: string) {
    setContactId(id);
    setAllocations([]);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      if (allocations.length === 0) throw new Error("Apply to at least one document");
      const body: Record<string, unknown> = {
        direction,
        amountCents: totalAllocatedCents,
        date,
        method,
        memo: memo || undefined,
        allocations: allocations.map(a => ({
          ...(direction === "RECEIVED" ? { invoiceId: a.docId } : { billId: a.docId }),
          amountCents: a.amountCents,
        })),
      };
      if (direction === "RECEIVED") body.customerId = contactId || undefined;
      else body.vendorId = contactId || undefined;
      return apiFetch("/payments", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["bills"] });
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

      <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-6 max-w-2xl">
        <Card>
          <CardHeader><CardTitle>Payment details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="direction">Direction *</Label>
                <Select id="direction" value={direction} onChange={e => handleDirectionChange(e.target.value as "RECEIVED" | "SENT")}>
                  <option value="RECEIVED">Received (from customer)</option>
                  <option value="SENT">Sent (to vendor)</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact">{contactLabel} *</Label>
                <Select id="contact" value={contactId} onChange={e => handleContactChange(e.target.value)} required>
                  <option value="">Select {contactLabel.toLowerCase()}…</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="memo">Memo</Label>
              <Input id="memo" placeholder="Optional note…" value={memo} onChange={e => setMemo(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Apply to {direction === "RECEIVED" ? "invoices" : "bills"}</span>
              {totalAllocatedCents > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  Total: {formatCents(totalAllocatedCents)}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!contactId ? (
              <p className="text-sm text-muted-foreground">Select a {contactLabel.toLowerCase()} above to see open {direction === "RECEIVED" ? "invoices" : "bills"}.</p>
            ) : availableDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open {direction === "RECEIVED" ? "invoices" : "bills"} for this {contactLabel.toLowerCase()}.</p>
            ) : (
              <>
                {allocations.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{direction === "RECEIVED" ? "Invoice" : "Bill"}</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead className="text-right">Amount applied</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allocations.map(a => (
                        <TableRow key={a.docId}>
                          <TableCell className="font-mono text-sm">{a.label}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCents(a.maxCents)}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number" min="0.01" step="0.01"
                              max={(a.maxCents / 100).toFixed(2)}
                              value={(a.amountCents / 100).toFixed(2)}
                              onChange={e => updateAllocationAmount(a.docId, Math.round(parseFloat(e.target.value) * 100))}
                              className="w-28 text-right tabular-nums ml-auto"
                            />
                          </TableCell>
                          <TableCell>
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeAllocation(a.docId)}>
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {unallocatedDocs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Available</p>
                    <div className="space-y-1">
                      {unallocatedDocs.map(doc => (
                        <div key={doc.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                          <span className="font-mono">{doc.number}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground tabular-nums">{formatCents(doc.balanceCents)} due</span>
                            <Button type="button" variant="outline" size="sm" onClick={() => addAllocation(doc)}>
                              <Plus className="h-3 w-3 mr-1" /> Apply
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" asChild>
            <Link href="/payments">Cancel</Link>
          </Button>
          <Button type="submit" disabled={saveMutation.isPending || allocations.length === 0 || totalAllocatedCents <= 0}>
            {saveMutation.isPending ? "Saving…" : "Record payment"}
          </Button>
        </div>
      </form>
    </>
  );
}
