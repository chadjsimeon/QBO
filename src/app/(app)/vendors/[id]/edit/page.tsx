import { notFound } from "next/navigation";
import { prisma, requireOrg } from "@/lib/tenant";
import { PageHeader } from "@/components/page-header";
import { VendorForm } from "../../vendor-form";
import { updateVendor } from "../../actions";

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireOrg();
  const vendor = await prisma.vendor.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!vendor) notFound();

  const action = updateVendor.bind(null, id);

  return (
    <>
      <PageHeader title={`Edit ${vendor.name}`} />
      <VendorForm action={action} values={vendor} submitLabel="Save changes" />
    </>
  );
}
