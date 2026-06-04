import { notFound, redirect } from "next/navigation";
import { prisma, requireOrg } from "@/lib/tenant";
import { toDateInput } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { DocumentForm, type LineRow } from "@/components/document-form";
import { updateBill } from "../../actions";

export default async function EditBillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrg();
  const bill = await prisma.bill.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!bill) notFound();
  if (bill.status !== "DRAFT") redirect(`/bills/${id}`);

  const [vendors, accounts, taxRates] = await Promise.all([
    prisma.vendor.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: "asc" },
    }),
    prisma.account.findMany({
      where: { organizationId: ctx.organizationId, type: "EXPENSE", isActive: true },
      orderBy: { code: "asc" },
    }),
    prisma.taxRate.findMany({ where: { organizationId: ctx.organizationId } }),
  ]);

  const lines: LineRow[] = bill.lineItems.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPrice: (l.unitPriceCents / 100).toFixed(2),
    accountId: l.accountId,
    taxRateId: l.taxRateId ?? "",
  }));

  const action = updateBill.bind(null, id);

  return (
    <>
      <PageHeader title={`Edit bill ${bill.number}`} />
      <DocumentForm
        action={action}
        contactLabel="Vendor"
        contacts={vendors}
        accounts={accounts}
        taxRates={taxRates}
        defaults={{
          contactId: bill.vendorId,
          number: bill.number,
          issueDate: toDateInput(bill.issueDate),
          dueDate: toDateInput(bill.dueDate),
          lines,
        }}
        submitLabel="Save changes"
        cancelHref={`/bills/${id}`}
      />
    </>
  );
}
