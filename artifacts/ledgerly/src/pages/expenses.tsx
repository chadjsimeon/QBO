import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

interface Expense {
  id: string; number: string; refNumber: string | null; method: string;
  vendorName: string | null; paymentAccountName: string | null;
  date: string; totalCents: number;
}

export default function ExpensesPage() {
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: () => apiFetch<Expense[]>("/expenses") });

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-1">Direct purchases paid from a bank or credit card.</p>
        </div>
        <Link href="/expenses/new"><Button><Plus className="h-4 w-4 mr-1" /> New expense</Button></Link>
      </div>

      {expenses.length === 0 ? (
        <EmptyState title="No expenses yet" description="Record a direct purchase or write a cheque."
          action={<Link href="/expenses/new"><Button><Plus className="h-4 w-4 mr-1" />New expense</Button></Link>} />
      ) : (
        <Card className="shadow-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>No.</TableHead>
                <TableHead>Payee</TableHead>
                <TableHead>Paid from</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map(e => (
                <TableRow key={e.id} className="cursor-pointer">
                  <TableCell className="text-muted-foreground">
                    <Link href={`/expenses/${e.id}`} className="hover:underline text-primary">{formatDate(e.date)}</Link>
                  </TableCell>
                  <TableCell className="font-medium">{e.number}{e.refNumber ? ` · #${e.refNumber}` : ""}</TableCell>
                  <TableCell>{e.vendorName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{e.paymentAccountName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">{e.method.replace("_", " ").toLowerCase()}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(e.totalCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
