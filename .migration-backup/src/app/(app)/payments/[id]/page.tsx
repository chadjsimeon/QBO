import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, requireOrg } from "@/lib/tenant";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActionButton } from "@/components/action-button";
import { JournalEntryView } from "@/components/journal-entry-view";
import { deletePayment } from "../actions";

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrg();
  const payment = await prisma.payment.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      customer: true,
      vendor: true,
      allocations: { include: { invoice: true, bill: true } },
    },
  });
  if (!payment) notFound();

  const entries = await prisma.journalEntry.findMany({
    where: { organizationId: ctx.organizationId, sourceType: "PAYMENT", sourceId: id },
    orderBy: { createdAt: "asc" },
    include: { lines: { include: { account: true } } },
  });

  const received = payment.direction === "RECEIVED";
  const del = deletePayment.bind(null, id);

  return (
    <>
      <PageHeader
        title={`Payment ${formatCents(payment.amountCents)}`}
        description={`${received ? "Received from" : "Paid to"} ${
          received ? payment.customer?.name : payment.vendor?.name
        } · ${formatDate(payment.date)}`}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={received ? "success" : "secondary"}>
              {received ? "Received" : "Sent"}
            </Badge>
            <ActionButton
              action={del}
              variant="destructive"
              confirmText="Delete this payment? Its ledger entry will be reversed and document balances restored."
              pendingLabel="Deleting…"
            >
              Delete
            </ActionButton>
          </div>
        }
      />

      <Card>
        <div className="border-b px-4 py-3 text-sm font-semibold">Applied to</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead className="text-right">Amount applied</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payment.allocations.map((a) => {
              const docNumber = a.invoice?.number ?? a.bill?.number ?? "—";
              const href = a.invoiceId
                ? `/invoices/${a.invoiceId}`
                : a.billId
                ? `/bills/${a.billId}`
                : "#";
              return (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link href={href} className="font-medium hover:underline">
                      {docNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(a.amountCents)}</TableCell>
                </TableRow>
              );
            })}
            <TableRow className="border-t-2 font-semibold">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">{formatCents(payment.amountCents)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Ledger entries</h2>
        <JournalEntryView entries={entries} />
      </div>
    </>
  );
}
