import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, formatCents } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ReportRow {
  id: string; code: string; name: string; amountCents: number; depth: number; isSubtotal?: boolean;
}

interface ReportSection { label: string; rows: ReportRow[]; total: number; }

interface ProfitLoss {
  income: ReportSection; expenses: ReportSection; netIncomeCents: number; start: string | null; end: string | null;
}

interface BalanceSheet {
  assets: ReportSection; liabilities: ReportSection; equity: ReportSection; asOf: string;
}

function SectionTable({ section }: { section: ReportSection }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {section.rows.map(r => (
          <TableRow key={r.id} className={r.isSubtotal ? "bg-muted/30 font-medium" : ""}>
            <TableCell style={{ paddingLeft: `${(r.depth + 1) * 16}px` }}>
              {r.code && !r.isSubtotal && <span className="text-muted-foreground mr-2 font-mono text-xs">{r.code}</span>}
              {r.name}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.amountCents !== 0 || r.isSubtotal ? formatCents(r.amountCents) : "—"}
            </TableCell>
          </TableRow>
        ))}
        <TableRow className="border-t-2 font-bold">
          <TableCell>Total {section.label.charAt(0) + section.label.slice(1).toLowerCase()}</TableCell>
          <TableCell className="text-right tabular-nums">{formatCents(section.total)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function ProfitLossReport() {
  const today = new Date();
  const [start, setStart] = useState(`${today.getFullYear()}-01-01`);
  const [end, setEnd] = useState(today.toISOString().slice(0, 10));

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["pl", start, end],
    queryFn: () => apiFetch<ProfitLoss>(`/reports/profit-loss?start=${start}&end=${end}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1"><Label>From</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} className="w-36" /></div>
        <div className="space-y-1"><Label>To</Label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} className="w-36" /></div>
        <Button onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "Loading…" : "Run report"}
        </Button>
      </div>

      {data && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Income</CardTitle></CardHeader>
            <CardContent className="p-0"><SectionTable section={data.income} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Expenses</CardTitle></CardHeader>
            <CardContent className="p-0"><SectionTable section={data.expenses} /></CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex justify-between font-bold text-lg">
                <span>Net Income</span>
                <span className={`tabular-nums ${data.netIncomeCents < 0 ? "text-destructive" : "text-green-600"}`}>
                  {formatCents(data.netIncomeCents)}
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function BalanceSheetReport() {
  const today = new Date().toISOString().slice(0, 10);
  const [asOf, setAsOf] = useState(today);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["bs", asOf],
    queryFn: () => apiFetch<BalanceSheet>(`/reports/balance-sheet?asOf=${asOf}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1"><Label>As of</Label><Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="w-36" /></div>
        <Button onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "Loading…" : "Run report"}
        </Button>
      </div>

      {data && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Assets</CardTitle></CardHeader>
            <CardContent className="p-0"><SectionTable section={data.assets} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Liabilities</CardTitle></CardHeader>
            <CardContent className="p-0"><SectionTable section={data.liabilities} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Equity</CardTitle></CardHeader>
            <CardContent className="p-0"><SectionTable section={data.equity} /></CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground">Financial statements and analysis.</p>
      </div>

      <Tabs defaultValue="pl">
        <TabsList className="mb-4">
          <TabsTrigger value="pl">Profit & Loss</TabsTrigger>
          <TabsTrigger value="bs">Balance Sheet</TabsTrigger>
        </TabsList>
        <TabsContent value="pl"><ProfitLossReport /></TabsContent>
        <TabsContent value="bs"><BalanceSheetReport /></TabsContent>
      </Tabs>
    </>
  );
}
