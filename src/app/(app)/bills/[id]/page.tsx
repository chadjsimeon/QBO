import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Check, Ban } from "lucide-react";
import { prisma, requireOrg } from "@/lib/tenant";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { BILL_STATUS_VARIANT } from "@/lib/status";
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
import { enterBill, voidBill, deleteBill } from "../actions";

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrg();
  const bill = await prisma.bill.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      vendor: true,
      lineItems: { orderBy: { sortOrder: "asc" }, include: { account: true, taxRate: true } },
    },
  });
  if (!bill) notFound();

  const entries = await prisma.journalEntry.findMany({
    where: { organizationId: ctx.organizationId, sourceType: "BILL", sourceId: id },
    orderBy: { createdAt: "asc" },
    include: { lines: { include: { account: true } } },
  });

  const isDraft = bill.status === "DRAFT";
  const isVoid = bill.status === "VOID";

  const enter = enterBill.bind(null, id);
  const voidIt = voidBill.bind(null, id);
  const del = deleteBill.bind(null, id);

  return (
    <>
      <PageHeader
        title={`Bill ${bill.number}`}
        description={`${bill.vendor.name} · dated ${formatDate(bill.issueDate)}`}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={BILL_STATUS_VARIANT[bill.status]}>{bill.status}</Badge>
            {isDraft && (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/bills/${id}/edit`}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Link>
                </Button>
                <ActionButton action={enter} pendingLabel="Posting…">
                  <Check className="h-4 w-4" /> Enter bill
                </ActionButton>
              </>
            )}
            {!isDraft && !isVoid && (
              <ActionButton
                action={voidIt}
                variant="destructive"
                confirmText="Void this bill? A reversing entry will be posted."
                pendingLabel="Voiding…"
              >
                <Ban className="h-4 w-4" /> Void
              </ActionButton>
            )}
            {isDraft && (
              <ActionButton action={del} variant="outline" confirmText="Delete this draft bill?">
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
            <div className="text-2xl font-bold tabular-nums">{formatCents(bill.totalCents)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Balance due</div>
            <div className="text-2xl font-bold tabular-nums">{formatCents(bill.balanceCents)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Due date</div>
            <div className="text-2xl font-bold">{formatDate(bill.dueDate)}</div>
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
              {bill.lineItems.map((l) => (
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
                <span className="tabular-nums">{formatCents(bill.subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span className="tabular-nums">{formatCents(bill.taxCents)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatCents(bill.totalCents)}</span>
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
