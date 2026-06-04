"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, requireOrg, assertOrg } from "@/lib/tenant";
import {
  documentSchema,
  computeDocument,
  groupByAccount,
  parseLinesPayload,
  rawLineSchema,
} from "@/lib/documents";
import { postInvoiceIssued, reverseEntry } from "@/lib/ledger";

export type DocFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

async function taxRateMap(organizationId: string) {
  const rates = await prisma.taxRate.findMany({ where: { organizationId } });
  return new Map(rates.map((r) => [r.id, r.rateBps]));
}

function readForm(formData: FormData) {
  const rawLines = parseLinesPayload(formData.get("lines"))
    .map((l) => rawLineSchema.safeParse(l))
    .filter((r) => r.success)
    .map((r) => (r as { data: ReturnType<typeof rawLineSchema.parse> }).data);

  return documentSchema.safeParse({
    contactId: formData.get("contactId"),
    number: formData.get("number"),
    issueDate: formData.get("issueDate"),
    dueDate: formData.get("dueDate"),
    lines: rawLines,
  });
}

export async function createInvoice(
  _prev: DocFormState,
  formData: FormData
): Promise<DocFormState> {
  const ctx = await requireOrg();
  const parsed = readForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid invoice" };
  }
  const data = parsed.data;
  const computed = computeDocument(data.lines, await taxRateMap(ctx.organizationId));

  let invoiceId = "";
  try {
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: ctx.organizationId,
        customerId: data.contactId,
        number: data.number,
        status: "DRAFT",
        issueDate: new Date(data.issueDate),
        dueDate: new Date(data.dueDate),
        subtotalCents: computed.subtotalCents,
        taxCents: computed.taxCents,
        totalCents: computed.totalCents,
        balanceCents: computed.totalCents,
        lineItems: {
          create: computed.lines.map((l, i) => ({
            description: l.description,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            taxRateId: l.taxRateId,
            accountId: l.accountId,
            amountCents: l.amountCents,
            sortOrder: i,
          })),
        },
      },
    });
    invoiceId = invoice.id;
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { number: "Invoice number already used" } };
    throw e;
  }

  revalidatePath("/invoices");
  redirect(`/invoices/${invoiceId}`);
}

export async function updateInvoice(
  id: string,
  _prev: DocFormState,
  formData: FormData
): Promise<DocFormState> {
  const ctx = await requireOrg();
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  assertOrg(invoice, ctx.organizationId);
  if (invoice!.status !== "DRAFT") {
    return { error: "Only draft invoices can be edited." };
  }
  const parsed = readForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid invoice" };
  }
  const data = parsed.data;
  const computed = computeDocument(data.lines, await taxRateMap(ctx.organizationId));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.update({
        where: { id },
        data: {
          customerId: data.contactId,
          number: data.number,
          issueDate: new Date(data.issueDate),
          dueDate: new Date(data.dueDate),
          subtotalCents: computed.subtotalCents,
          taxCents: computed.taxCents,
          totalCents: computed.totalCents,
          balanceCents: computed.totalCents,
          lineItems: {
            create: computed.lines.map((l, i) => ({
              description: l.description,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
              taxRateId: l.taxRateId,
              accountId: l.accountId,
              amountCents: l.amountCents,
              sortOrder: i,
            })),
          },
        },
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { number: "Invoice number already used" } };
    throw e;
  }

  revalidatePath("/invoices");
  redirect(`/invoices/${id}`);
}

/** Issue (send) a draft invoice: post the balanced journal entry to the ledger. */
export async function issueInvoice(id: string): Promise<void> {
  const ctx = await requireOrg();
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { lineItems: true },
  });
  assertOrg(invoice, ctx.organizationId);
  if (invoice!.status !== "DRAFT") return;

  const incomeLines = groupByAccount(
    invoice!.lineItems.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      taxRateId: l.taxRateId,
      accountId: l.accountId,
      amountCents: l.amountCents,
      taxCents: 0,
    }))
  );

  await prisma.$transaction(async (tx) => {
    await postInvoiceIssued(tx, {
      organizationId: ctx.organizationId,
      invoiceId: invoice!.id,
      date: invoice!.issueDate,
      number: invoice!.number,
      totalCents: invoice!.totalCents,
      taxCents: invoice!.taxCents,
      incomeLines,
    });
    await tx.invoice.update({
      where: { id },
      data: { status: "SENT", balanceCents: invoice!.totalCents },
    });
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
}

/** Void a posted invoice via a reversing entry. Disallowed once payments applied. */
export async function voidInvoice(id: string): Promise<void> {
  const ctx = await requireOrg();
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  assertOrg(invoice, ctx.organizationId);
  if (invoice!.status === "VOID") return;

  if (invoice!.status === "DRAFT") {
    await prisma.invoice.update({ where: { id }, data: { status: "VOID", balanceCents: 0 } });
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${id}`);
    return;
  }

  if (invoice!.balanceCents !== invoice!.totalCents) {
    throw new Error("Cannot void an invoice with payments applied. Remove payments first.");
  }

  await prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.findFirst({
      where: {
        organizationId: ctx.organizationId,
        sourceType: "INVOICE",
        sourceId: id,
        isReversal: false,
      },
    });
    if (entry) {
      await reverseEntry(tx, ctx.organizationId, entry.id, new Date(), `Void invoice ${invoice!.number}`);
    }
    await tx.invoice.update({ where: { id }, data: { status: "VOID", balanceCents: 0 } });
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
}

export async function deleteInvoice(id: string): Promise<void> {
  const ctx = await requireOrg();
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  assertOrg(invoice, ctx.organizationId);
  if (invoice!.status !== "DRAFT") {
    throw new Error("Only draft invoices can be deleted. Void posted invoices instead.");
  }
  await prisma.invoice.delete({ where: { id } });
  revalidatePath("/invoices");
  redirect("/invoices");
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  );
}
