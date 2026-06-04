import { redirect } from "next/navigation";
import { prisma, requireOrg } from "@/lib/tenant";
import { toDateInput, addDays } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { DocumentForm } from "@/components/document-form";
import { createInvoice } from "../actions";

export default async function NewInvoicePage() {
  const ctx = await requireOrg();
  const [customers, accounts, taxRates, count] = await Promise.all([
    prisma.customer.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { name: "asc" },
    }),
    prisma.account.findMany({
      where: { organizationId: ctx.organizationId, type: "INCOME", isActive: true },
      orderBy: { code: "asc" },
    }),
    prisma.taxRate.findMany({ where: { organizationId: ctx.organizationId } }),
    prisma.invoice.count({ where: { organizationId: ctx.organizationId } }),
  ]);

  if (customers.length === 0) {
    return (
      <>
        <PageHeader title="New invoice" />
        <EmptyState
          title="Add a customer first"
          description="You need at least one customer before creating an invoice."
          action={
            <Button asChild>
              <a href="/customers/new">New customer</a>
            </Button>
          }
        />
      </>
    );
  }

  const today = new Date();
  const defaults = {
    number: `INV-${String(count + 1).padStart(4, "0")}`,
    issueDate: toDateInput(today),
    dueDate: toDateInput(addDays(today, 30)),
  };

  return (
    <>
      <PageHeader title="New invoice" />
      <DocumentForm
        action={createInvoice}
        contactLabel="Customer"
        contacts={customers}
        accounts={accounts}
        taxRates={taxRates}
        defaults={defaults}
        submitLabel="Save draft"
        cancelHref="/invoices"
      />
    </>
  );
}
