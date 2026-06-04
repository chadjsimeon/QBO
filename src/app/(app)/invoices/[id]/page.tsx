import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Send, Ban } from "lucide-react";
import { prisma, requireOrg } from "@/lib/tenant";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { INVOICE_STATUS_VARIANT } from "@/lib/status";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
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
import { issueInvoice, voidInvoice, deleteInvoice } from "../actions";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrg();
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      customer: true,
      lineItems: { orderBy: { sortOrder: "asc" }, include: { account: true, taxRate: true } },
    },
  });
  if (!invoice) notFound();

  const entries = await prisma.journalEntry.findMany({
    where: { organizationId: ctx.organizationId, sourceType: "INVOICE", sourceId: id },
    orderBy: { createdAt: "asc" },
    include: { lines: { include: { account: true } } },
  });

  const isDraft = invoice.status === "DRAFT";
  const isVoid = invoice.status === "VOID";

  const issue = issueInvoice.bind(null, id);
  const voidIt = voidInvoice.bind(null, id);
  const del = deleteInvoice.bind(null, id);

  return (
    <>
      <PageHeader
        title={`Invoice ${invoice.number}`}
        description={`${invoice.customer.name} · issued ${formatDate(invoice.issueDate)}`}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={INVOICE_STATUS_VARIANT[invoice.status]}>{invoice.status}</Badge>
            {isDraft && (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/invoices/${id}/edit`}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Link>
                </Button>
                <ActionButton action={issue} pendingLabel="Issuing…">
                  <Send className="h-4 w-4" /> Issue
                </ActionButton>
              </>
            )}
            {!isDraft && !isVoid && (
              <ActionButton
                action={voidIt}
                variant="destructive"
                confirmText="Void this invoice? A reversing entry will be posted."
                pendingLabel="Voiding…"
              >
                <Ban className="h-4 w-4" /> Void
              </ActionButton>
            )}
            {isDraft && (
              <ActionButton
                action={del}
                variant="outline"
                confirmText="Delete this draft invoice?"
              >
                Delete
              </ActionButton>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-bold tabular-nums">{formatCents(invoice.totalCents)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Balance due</div>
            <div className="text-2xl font-bold tabular-nums">{formatCents(invoice.balanceCents)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Due date</div>
            <div className="text-2xl font-bold">{formatDate(invoice.dueDate)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lineItems.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.description}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {l.account.code} · {l.account.name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(l.unitPriceCents)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{l.taxRate?.name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(l.amountCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-end border-t px-4 py-3">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCents(invoice.subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span className="tabular-nums">{formatCents(invoice.taxCents)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatCents(invoice.totalCents)}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Ledger entries</h2>
        <JournalEntryView entries={entries} />
      </div>
    </>
  );
}
