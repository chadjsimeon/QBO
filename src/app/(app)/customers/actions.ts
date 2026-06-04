"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma, requireOrg, assertOrg } from "@/lib/tenant";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  billingAddress: z.string().trim().optional(),
});

export type CustomerFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function parse(formData: FormData) {
  return schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    billingAddress: formData.get("billingAddress"),
  });
}

export async function createCustomer(
  _prev: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const ctx = await requireOrg();
  const result = parse(formData);
  if (!result.success) {
    return { fieldErrors: fieldErrorMap(result.error) };
  }
  await prisma.customer.create({
    data: { organizationId: ctx.organizationId, ...normalize(result.data) },
  });
  revalidatePath("/customers");
  redirect("/customers");
}

export async function updateCustomer(
  id: string,
  _prev: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  const ctx = await requireOrg();
  const result = parse(formData);
  if (!result.success) {
    return { fieldErrors: fieldErrorMap(result.error) };
  }
  const existing = await prisma.customer.findUnique({ where: { id } });
  assertOrg(existing, ctx.organizationId);

  await prisma.customer.update({
    where: { id },
    data: normalize(result.data),
  });
  revalidatePath("/customers");
  redirect("/customers");
}

export async function deleteCustomer(id: string): Promise<void> {
  const ctx = await requireOrg();
  const existing = await prisma.customer.findUnique({ where: { id } });
  assertOrg(existing, ctx.organizationId);
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/customers");
}

function normalize(data: z.infer<typeof schema>) {
  return {
    name: data.name,
    email: data.email ? data.email : null,
    phone: data.phone ? data.phone : null,
    billingAddress: data.billingAddress ? data.billingAddress : null,
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
