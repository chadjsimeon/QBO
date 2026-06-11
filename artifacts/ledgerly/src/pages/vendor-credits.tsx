import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
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

interface VendorCredit {
  id: string;
  number: string;
  vendorName: string | null;
  date: string;
  totalCents: number;
  balanceCents: number;
}

export default function VendorCreditsPage() {
  const { data: credits = [] } = useQuery({
    queryKey: ["vendor-credits"],
    queryFn: () => apiFetch<VendorCredit[]>("/vendor-credits"),
  });
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Supplier credits</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vendor credits you can apply against open bills.
          </p>
        </div>
        <Link href="/vendor-credits/new">
          <Button>
            <Plus className="h-4 w-4 mr-1" /> New supplier credit
          </Button>
        </Link>
      </div>
      {credits.length === 0 ? (
        <EmptyState
          title="No supplier credits yet"
          description="Record a vendor credit and apply it to their bills."
          action={
            <Link href="/vendor-credits/new">
              <Button>
                <Plus className="h-4 w-4 mr-1" />
                New supplier credit
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
                <TableHead>No.</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credits.map((c) => (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell className="text-muted-foreground">
                    <Link href={`/vendor-credits/${c.id}`} className="hover:underline text-primary">
                      {formatDate(c.date)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">{c.number}</TableCell>
                  <TableCell>{c.vendorName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(c.totalCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(c.balanceCents)}
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
