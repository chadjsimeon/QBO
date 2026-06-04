import { prisma, requireOrg } from "@/lib/tenant";
import { toDateInput } from "@/lib/dates";
import { OPEN_INVOICE_STATUSES, OPEN_BILL_STATUSES } from "@/lib/status";
import { PageHeader } from "@/components/page-header";
import { PaymentForm, type ContactWithDocs } from "../payment-form";

export default async function NewPaymentPage() {
  const ctx = await requireOrg();

  const [customers, vendors] = await Promise.all([
    prisma.customer.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: "asc" },
      include: {
        invoices: {
          where: { status: { in: OPEN_INVOICE_STATUSES }, balanceCents: { gt: 0 } },
          orderBy: { dueDate: "asc" },
        },
      },
    }),
    prisma.vendor.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: "asc" },
      include: {
        bills: {
          where: { status: { in: OPEN_BILL_STATUSES }, balanceCents: { gt: 0 } },
          orderBy: { dueDate: "asc" },
        },
      },
    }),
  ]);

  const customerData: ContactWithDocs[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    docs: c.invoices.map((i) => ({
      id: i.id,
      number: i.number,
      balanceCents: i.balanceCents,
      dueDate: toDateInput(i.dueDate),
    })),
  }));
  const vendorData: ContactWithDocs[] = vendors.map((v) => ({
    id: v.id,
    name: v.name,
    docs: v.bills.map((b) => ({
      id: b.id,
      number: b.number,
      balanceCents: b.balanceCents,
      dueDate: toDateInput(b.dueDate),
    })),
  }));

  return (
    <>
      <PageHeader title="Record payment" description="Apply a payment to open invoices or bills." />
      <PaymentForm
        customers={customerData}
        vendors={vendorData}
        today={toDateInput(new Date())}
      />
    </>
  );
}
