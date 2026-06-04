import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface JournalEntryWithLines {
  id: string;
  date: Date;
  memo: string | null;
  isReversal: boolean;
  lines: {
    id: string;
    debitCents: number;
    creditCents: number;
    account: { code: string; name: string };
  }[];
}

/** Read-only view of the ledger entries a document produced. */
export function JournalEntryView({ entries }: { entries: JournalEntryWithLines[] }) {
  if (entries.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No ledger entries yet. Issue this document to post to the ledger.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map((entry) => {
        const debits = entry.lines.reduce((s, l) => s + l.debitCents, 0);
        const credits = entry.lines.reduce((s, l) => s + l.creditCents, 0);
        return (
          <Card key={entry.id}>
            <div className="flex items-center justify-between border-b px-4 py-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{formatDate(entry.date)}</span>
                <span className="text-muted-foreground">{entry.memo}</span>
                {entry.isReversal && <Badge variant="warning">Reversal</Badge>}
              </div>
            </div>
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
                      <span className="font-mono text-xs text-muted-foreground">{l.account.code}</span>{" "}
                      {l.account.name}
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
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(debits)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(credits)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        );
      })}
    </div>
  );
}
