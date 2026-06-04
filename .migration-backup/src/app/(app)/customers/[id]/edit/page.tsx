import { notFound } from "next/navigation";
import { prisma, requireOrg } from "@/lib/tenant";
import { PageHeader } from "@/components/page-header";
import { CustomerForm } from "../../customer-form";
import { updateCustomer } from "../../actions";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrg();
  const customer = await prisma.customer.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!customer) notFound();

  const action = updateCustomer.bind(null, id);

  return (
    <>
      <PageHeader title={`Edit ${customer.name}`} />
      <CustomerForm
        action={action}
        values={customer}
        submitLabel="Save changes"
      />
    </>
  );
}
