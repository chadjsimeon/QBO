import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Line {
  id: string;
  accountId: string;
  accountCode: string | null;
  accountName: string | null;
  debitCents: number;
  creditCents: number;
}
interface Entry {
  id: string;
  date: string;
  memo: string | null;
  sourceType: string;
  lines: Line[];
}

export default function JournalEntryDetailPage() {
  const [, params] = useRoute("/journal-entries/:id");
  const id = params?.id;

  const { data: entry } = useQuery({
    queryKey: ["journal-entry", id],
    queryFn: () => apiFetch<Entry>(`/journal-entries/${id}`),
    enabled: !!id,
  });

  if (!entry) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const debits = entry.lines.reduce((s, l) => s + l.debitCents, 0);
  const credits = entry.lines.reduce((s, l) => s + l.creditCents, 0);

  return (
    <>
      <div className="mb-6">
        <Link
          href="/journal-entries"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-3 w-3" /> Back to journal entries
        </Link>
        <h1 className="text-2xl font-bold">{entry.memo ?? "Journal entry"}</h1>
        <p className="text-sm text-muted-foreground mt-1">{formatDate(entry.date)}</p>
      </div>

      <Card className="shadow-md overflow-hidden">
        <CardHeader>
          <CardTitle>Ledger lines</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entry.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground mr-1">
                      {l.accountCode}
                    </span>
                    {l.accountName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.debitCents ? formatCents(l.debitCents) : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.creditCents ? formatCents(l.creditCents) : ""}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-semibold">
                <TableCell className="text-right text-muted-foreground">Totals</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(debits)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCents(credits)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
