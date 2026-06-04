import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma, requireOrg } from "@/lib/tenant";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { BILL_STATUS_VARIANT } from "@/lib/status";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
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

export default async function BillsPage() {
  const ctx = await requireOrg();
  const bills = await prisma.bill.findMany({
    where: { organizationId: ctx.organizationId },
    include: { vendor: true },
    orderBy: { issueDate: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Bills"
        description="Money you owe to vendors."
        action={
          <Button asChild>
            <Link href="/bills/new">
              <Plus className="h-4 w-4" /> New bill
            </Link>
          </Button>
        }
      />

      {bills.length === 0 ? (
        <EmptyState
          title="No bills yet"
          description="Enter a bill and post it to the ledger."
          action={
            <Button asChild>
              <Link href="/bills/new">
                <Plus className="h-4 w-4" /> New bill
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((bill) => (
                <TableRow key={bill.id}>
                  <TableCell className="font-medium">
                    <Link href={`/bills/${bill.id}`} className="hover:underline">
                      {bill.number}
                    </Link>
                  </TableCell>
                  <TableCell>{bill.vendor.name}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(bill.issueDate)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(bill.dueDate)}</TableCell>
                  <TableCell>
                    <Badge variant={BILL_STATUS_VARIANT[bill.status]}>{bill.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(bill.totalCents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(bill.balanceCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
