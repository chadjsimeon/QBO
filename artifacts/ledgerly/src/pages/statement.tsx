import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { apiFetch, formatCents, formatDate, toDateInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Customer { id: string; name: string; }
interface Entry { date: string; type: string; ref: string; chargeCents: number; creditCents: number; amountCents: number; }
interface Statement {
  customer: { name: string; email: string | null; billingAddress: string | null };
  from: string; to: string; openingBalanceCents: number; closingBalanceCents: number; entries: Entry[];
}

export default function StatementPage() {
  const year = new Date().getFullYear();
  const [customerId, setCustomerId] = useState("");
  const [from, setFrom] = useState(toDateInput(new Date(year, 0, 1)));
  const [to, setTo] = useState(toDateInput(new Date()));

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => apiFetch<Customer[]>("/customers") });
  const { data: statement } = useQuery({
    queryKey: ["statement", customerId, from, to],
    queryFn: () => apiFetch<Statement>(`/statements/customer/${customerId}?from=${from}&to=${to}`),
    enabled: !!customerId,
  });

  return (
    <>
      <div className="no-print mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customer statement</h1>
          <p className="text-sm text-muted-foreground mt-1">Open-item statement of a customer's account.</p>
        </div>
        {statement && <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print</Button>}
      </div>

      <Card className="no-print mb-6">
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6">
          <div className="space-y-2">
            <Label>Customer</Label>
            <Select value={customerId} onChange={e => setCustomerId(e.target.value)}>
              <option value="">Select customer…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="space-y-2"><Label>From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="space-y-2"><Label>To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        </CardContent>
      </Card>

      {!customerId ? (
        <p className="text-sm text-muted-foreground">Select a customer to generate a statement.</p>
      ) : !statement ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Card className="shadow-md overflow-hidden print:shadow-none print:border-0">
          <CardContent className="pt-6">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">Statement of Account</h2>
                <p className="text-sm text-muted-foreground">{formatDate(statement.from)} – {formatDate(statement.to)}</p>
              </div>
              <div className="text-right text-sm">
                <div className="font-semibold">{statement.customer.name}</div>
                {statement.customer.email && <div className="text-muted-foreground">{statement.customer.email}</div>}
                {statement.customer.billingAddress && <div className="text-muted-foreground whitespace-pre-line">{statement.customer.billingAddress}</div>}
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Reference</TableHead>
                  <TableHead className="text-right">Charges</TableHead><TableHead className="text-right">Credits</TableHead><TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="text-muted-foreground">
                  <TableCell colSpan={5} className="font-medium">Opening balance</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(statement.openingBalanceCents)}</TableCell>
                </TableRow>
                {statement.entries.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground">{formatDate(e.date)}</TableCell>
                    <TableCell>{e.type}</TableCell>
                    <TableCell>{e.ref}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.chargeCents ? formatCents(e.chargeCents) : ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.creditCents ? formatCents(e.creditCents) : ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(e.amountCents)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-bold">
                  <TableCell colSpan={5}>Balance due</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(statement.closingBalanceCents)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
