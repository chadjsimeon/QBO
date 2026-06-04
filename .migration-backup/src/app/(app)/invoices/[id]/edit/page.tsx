import { notFound, redirect } from "next/navigation";
import { prisma, requireOrg } from "@/lib/tenant";
import { toDateInput } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { DocumentForm, type LineRow } from "@/components/document-form";
import { updateInvoice } from "../../actions";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrg();
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) notFound();
  if (invoice.status !== "DRAFT") redirect(`/invoices/${id}`);

  const [customers, accounts, taxRates] = await Promise.all([
    prisma.customer.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: "asc" },
    }),
    prisma.account.findMany({
      where: { organizationId: ctx.organizationId, type: "INCOME", isActive: true },
      orderBy: { code: "asc" },
    }),
    prisma.taxRate.findMany({ where: { organizationId: ctx.organizationId } }),
  ]);

  const lines: LineRow[] = invoice.lineItems.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPrice: (l.unitPriceCents / 100).toFixed(2),
    accountId: l.accountId,
    taxRateId: l.taxRateId ?? "",
  }));

  const action = updateInvoice.bind(null, id);

  return (
    <>
      <PageHeader title={`Edit invoice ${invoice.number}`} />
      <DocumentForm
        action={action}
        contactLabel="Customer"
        contacts={customers}
        accounts={accounts}
        taxRates={taxRates}
        defaults={{
          contactId: invoice.customerId,
          number: invoice.number,
          issueDate: toDateInput(invoice.issueDate),
          dueDate: toDateInput(invoice.dueDate),
          lines,
        }}
        submitLabel="Save changes"
        cancelHref={`/invoices/${id}`}
      />
    </>
  );
}
