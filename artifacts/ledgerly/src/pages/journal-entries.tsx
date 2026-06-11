import { useQuery } from "@tanstack/react-query";
import { Plus, BookOpen } from "lucide-react";
import { Link } from "wouter";
import { apiFetch, formatCents, formatDate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

interface JournalEntry {
  id: string;
  date: string;
  memo: string | null;
  sourceType: string;
  totalCents: number;
}

export default function JournalEntriesPage() {
  const { data: entries = [] } = useQuery({
    queryKey: ["journal-entries"],
    queryFn: () => apiFetch<JournalEntry[]>("/journal-entries"),
  });

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Journal entries</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manual debits and credits posted directly to the ledger.
          </p>
        </div>
        <Link href="/journal-entries/new">
          <Button>
            <Plus className="h-4 w-4 mr-1" /> New journal entry
          </Button>
        </Link>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="No journal entries yet"
          description="Post a manual balanced entry of debits and credits."
          action={
            <Link href="/journal-entries/new">
              <Button>
                <Plus className="h-4 w-4 mr-1" />
                New journal entry
              </Button>
            </Link>
          }
        />
      ) : (
        <Card className="shadow-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Memo</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id} className="cursor-pointer">
                  <TableCell className="text-muted-foreground">
                    <Link
                      href={`/journal-entries/${e.id}`}
                      className="hover:underline text-primary"
                    >
                      {formatDate(e.date)}
                    </Link>
                  </TableCell>
                  <TableCell className="flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    {e.memo ?? "Journal entry"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(e.totalCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
