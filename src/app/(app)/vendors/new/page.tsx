import { PageHeader } from "@/components/page-header";
import { VendorForm } from "../vendor-form";
import { createVendor } from "../actions";

export default function NewVendorPage() {
  return (
    <>
      <PageHeader title="New vendor" />
      <VendorForm action={createVendor} submitLabel="Create vendor" />
    </>
  );
}
