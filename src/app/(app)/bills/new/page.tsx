import { prisma, requireOrg } from "@/lib/tenant";
import { toDateInput, addDays } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { DocumentForm } from "@/components/document-form";
import { createBill } from "../actions";

export default async function NewBillPage() {
  const ctx = await requireOrg();
  const [vendors, accounts, taxRates, count] = await Promise.all([
    prisma.vendor.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: "asc" },
    }),
    prisma.account.findMany({
      where: {
        organizationId: ctx.organizationId,
        type: "EXPENSE",
        isActive: true,
      },
      orderBy: { code: "asc" },
    }),
    prisma.taxRate.findMany({ where: { organizationId: ctx.organizationId } }),
    prisma.bill.count({ where: { organizationId: ctx.organizationId } }),
  ]);

  if (vendors.length === 0) {
    return (
      <>
        <PageHeader title="New bill" />
        <EmptyState
          title="Add a vendor first"
          description="You need at least one vendor before entering a bill."
          action={
            <Button asChild>
              <a href="/vendors/new">New vendor</a>
            </Button>
          }
        />
      </>
    );
  }

  const today = new Date();
  const defaults = {
    number: `BILL-${String(count + 1).padStart(4, "0")}`,
    issueDate: toDateInput(today),
    dueDate: toDateInput(addDays(today, 30)),
  };

  return (
    <>
      <PageHeader title="New bill" />
      <DocumentForm
        action={createBill}
        contactLabel="Vendor"
        contacts={vendors}
        accounts={accounts}
        taxRates={taxRates}
        defaults={defaults}
        submitLabel="Save draft"
        cancelHref="/bills"
      />
    </>
  );
}
