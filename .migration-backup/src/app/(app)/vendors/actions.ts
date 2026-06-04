"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma, requireOrg, assertOrg } from "@/lib/tenant";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

export type VendorFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function parse(formData: FormData) {
  return schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
  });
}

export async function createVendor(
  _prev: VendorFormState,
  formData: FormData
): Promise<VendorFormState> {
  const ctx = await requireOrg();
  const result = parse(formData);
  if (!result.success) return { fieldErrors: fieldErrorMap(result.error) };
  await prisma.vendor.create({
    data: { organizationId: ctx.organizationId, ...normalize(result.data) },
  });
  revalidatePath("/vendors");
  redirect("/vendors");
}

export async function updateVendor(
  id: string,
  _prev: VendorFormState,
  formData: FormData
): Promise<VendorFormState> {
  const ctx = await requireOrg();
  const result = parse(formData);
  if (!result.success) return { fieldErrors: fieldErrorMap(result.error) };
  const existing = await prisma.vendor.findUnique({ where: { id } });
  assertOrg(existing, ctx.organizationId);
  await prisma.vendor.update({ where: { id }, data: normalize(result.data) });
  revalidatePath("/vendors");
  redirect("/vendors");
}

export async function deleteVendor(id: string): Promise<void> {
  const ctx = await requireOrg();
  const existing = await prisma.vendor.findUnique({ where: { id } });
  assertOrg(existing, ctx.organizationId);
  await prisma.vendor.delete({ where: { id } });
  revalidatePath("/vendors");
}

function normalize(data: z.infer<typeof schema>) {
  return {
    name: data.name,
    email: data.email ? data.email : null,
    phone: data.phone ? data.phone : null,
    address: data.address ? data.address : null,
  };
}

function fieldErrorMap(error: z.ZodError): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !map[key]) map[key] = issue.message;
  }
  return map;
}
