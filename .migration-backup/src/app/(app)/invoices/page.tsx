import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma, requireOrg } from "@/lib/tenant";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { INVOICE_STATUS_VARIANT } from "@/lib/status";
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

export default async function InvoicesPage() {
  const ctx = await requireOrg();
  const invoices = await prisma.invoice.findMany({
    where: { organizationId: ctx.organizationId },
    include: { customer: true },
    orderBy: { issueDate: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Money owed to you by customers."
        action={
          <Button asChild>
            <Link href="/invoices/new">
              <Plus className="h-4 w-4" /> New invoice
            </Link>
          </Button>
        }
      />

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Create an invoice and issue it to post to the ledger."
          action={
            <Button asChild>
              <Link href="/invoices/new">
                <Plus className="h-4 w-4" /> New invoice
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
                <TableHead>Customer</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link href={`/invoices/${inv.id}`} className="hover:underline">
                      {inv.number}
                    </Link>
                  </TableCell>
                  <TableCell>{inv.customer.name}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(inv.issueDate)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(inv.dueDate)}</TableCell>
                  <TableCell>
                    <Badge variant={INVOICE_STATUS_VARIANT[inv.status]}>{inv.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(inv.totalCents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(inv.balanceCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
