import { useQuery } from "@tanstack/react-query";
import { FileBarChart } from "lucide-react";
import { apiFetch, formatCents } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AgingRow {
  id: string;
  name: string;
  totalCents: number;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
}

interface AgingReport {
  rows: AgingRow[];
  totals: AgingRow;
}

function AgingTable({ data }: { data: AgingReport }) {
  const cols = [
    { key: "current", label: "Current" },
    { key: "days30", label: "1–30 days" },
    { key: "days60", label: "31–60 days" },
    { key: "days90", label: "61–90 days" },
    { key: "over90", label: ">90 days" },
  ] as const;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          {cols.map((c) => (
            <TableHead key={c.key} className="text-right">
              {c.label}
            </TableHead>
          ))}
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>{r.name}</TableCell>
            {cols.map((c) => (
              <TableCell key={c.key} className="text-right tabular-nums">
                {r[c.key] > 0 ? formatCents(r[c.key]) : "—"}
              </TableCell>
            ))}
            <TableCell className="text-right tabular-nums font-medium">
              {formatCents(r.totalCents)}
            </TableCell>
          </TableRow>
        ))}
        <TableRow className="bg-muted/30 font-bold border-t-2">
          <TableCell>Total</TableCell>
          {cols.map((c) => (
            <TableCell key={c.key} className="text-right tabular-nums">
              {formatCents(data.totals[c.key])}
            </TableCell>
          ))}
          <TableCell className="text-right tabular-nums">
            {formatCents(data.totals.totalCents)}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function ArAgingTab() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ar-aging"],
    queryFn: () => apiFetch<AgingReport>("/reports/ar-aging"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Outstanding invoices grouped by days past due
          </p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} variant="outline" size="sm">
          {isFetching ? "Loading…" : "Refresh"}
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data && data.rows.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <AgingTable data={data} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">No open receivables.</p>
      )}
    </div>
  );
}

function ApAgingTab() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["ap-aging"],
    queryFn: () => apiFetch<AgingReport>("/reports/ap-aging"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Outstanding bills grouped by days past due
          </p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} variant="outline" size="sm">
          {isFetching ? "Loading…" : "Refresh"}
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data && data.rows.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <AgingTable data={data} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">No open payables.</p>
      )}
    </div>
  );
}

export default function ManagementReportsPage() {
  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <FileBarChart className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Management Reports</h1>
          <p className="text-sm text-muted-foreground">Aging schedules and AR/AP analysis.</p>
        </div>
      </div>

      <Tabs defaultValue="ar">
        <TabsList className="mb-4">
          <TabsTrigger value="ar">A/R Aging</TabsTrigger>
          <TabsTrigger value="ap">A/P Aging</TabsTrigger>
        </TabsList>
        <TabsContent value="ar">
          <ArAgingTab />
        </TabsContent>
        <TabsContent value="ap">
          <ApAgingTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
