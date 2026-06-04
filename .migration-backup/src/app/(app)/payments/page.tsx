import Link from "next/link";
import { Plus, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { prisma, requireOrg } from "@/lib/tenant";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
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

export default async function PaymentsPage() {
  const ctx = await requireOrg();
  const payments = await prisma.payment.findMany({
    where: { organizationId: ctx.organizationId },
    include: { customer: true, vendor: true, allocations: true },
    orderBy: { date: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Payments"
        description="Money received from customers and paid to vendors."
        action={
          <Button asChild>
            <Link href="/payments/new">
              <Plus className="h-4 w-4" /> Record payment
            </Link>
          </Button>
        }
      />

      {payments.length === 0 ? (
        <EmptyState
          title="No payments yet"
          description="Record a payment to apply it against open invoices or bills."
          action={
            <Button asChild>
              <Link href="/payments/new">
                <Plus className="h-4 w-4" /> Record payment
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Applied to</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => {
                const received = p.direction === "RECEIVED";
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/payments/${p.id}`} className="hover:underline">
                        {formatDate(p.date)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={received ? "success" : "secondary"}>
                        {received ? (
                          <ArrowDownLeft className="mr-1 h-3 w-3" />
                        ) : (
                          <ArrowUpRight className="mr-1 h-3 w-3" />
                        )}
                        {received ? "Received" : "Sent"}
                      </Badge>
                    </TableCell>
                    <TableCell>{received ? p.customer?.name : p.vendor?.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.method.replace("_", " ").toLowerCase()}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {p.allocations.length} doc{p.allocations.length === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(p.amountCents)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
