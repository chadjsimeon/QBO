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
import { postBillEntered, reverseEntry } from "@/lib/ledger";

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

export async function createBill(
  _prev: DocFormState,
  formData: FormData
): Promise<DocFormState> {
  const ctx = await requireOrg();
  const parsed = readForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid bill" };
  const data = parsed.data;
  const computed = computeDocument(data.lines, await taxRateMap(ctx.organizationId));

  let billId = "";
  try {
    const bill = await prisma.bill.create({
      data: {
        organizationId: ctx.organizationId,
        vendorId: data.contactId,
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
    billId = bill.id;
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { number: "Bill number already used" } };
    throw e;
  }

  revalidatePath("/bills");
  redirect(`/bills/${billId}`);
}

export async function updateBill(
  id: string,
  _prev: DocFormState,
  formData: FormData
): Promise<DocFormState> {
  const ctx = await requireOrg();
  const bill = await prisma.bill.findUnique({ where: { id } });
  assertOrg(bill, ctx.organizationId);
  if (bill!.status !== "DRAFT") return { error: "Only draft bills can be edited." };
  const parsed = readForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid bill" };
  const data = parsed.data;
  const computed = computeDocument(data.lines, await taxRateMap(ctx.organizationId));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.billLineItem.deleteMany({ where: { billId: id } });
      await tx.bill.update({
        where: { id },
        data: {
          vendorId: data.contactId,
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
    if (isUniqueViolation(e)) return { fieldErrors: { number: "Bill number already used" } };
    throw e;
  }

  revalidatePath("/bills");
  redirect(`/bills/${id}`);
}

/** Enter (post) a draft bill: post the balanced journal entry to the ledger. */
export async function enterBill(id: string): Promise<void> {
  const ctx = await requireOrg();
  const bill = await prisma.bill.findUnique({ where: { id }, include: { lineItems: true } });
  assertOrg(bill, ctx.organizationId);
  if (bill!.status !== "DRAFT") return;

  const expenseLines = groupByAccount(
    bill!.lineItems.map((l) => ({
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
    await postBillEntered(tx, {
      organizationId: ctx.organizationId,
      billId: bill!.id,
      date: bill!.issueDate,
      number: bill!.number,
      totalCents: bill!.totalCents,
      taxCents: bill!.taxCents,
      expenseLines,
    });
    await tx.bill.update({ where: { id }, data: { status: "OPEN", balanceCents: bill!.totalCents } });
  });

  revalidatePath("/bills");
  revalidatePath(`/bills/${id}`);
}

export async function voidBill(id: string): Promise<void> {
  const ctx = await requireOrg();
  const bill = await prisma.bill.findUnique({ where: { id } });
  assertOrg(bill, ctx.organizationId);
  if (bill!.status === "VOID") return;

  if (bill!.status === "DRAFT") {
    await prisma.bill.update({ where: { id }, data: { status: "VOID", balanceCents: 0 } });
    revalidatePath("/bills");
    revalidatePath(`/bills/${id}`);
    return;
  }

  if (bill!.balanceCents !== bill!.totalCents) {
    throw new Error("Cannot void a bill with payments applied. Remove payments first.");
  }

  await prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.findFirst({
      where: { organizationId: ctx.organizationId, sourceType: "BILL", sourceId: id, isReversal: false },
    });
    if (entry) {
      await reverseEntry(tx, ctx.organizationId, entry.id, new Date(), `Void bill ${bill!.number}`);
    }
    await tx.bill.update({ where: { id }, data: { status: "VOID", balanceCents: 0 } });
  });

  revalidatePath("/bills");
  revalidatePath(`/bills/${id}`);
}

export async function deleteBill(id: string): Promise<void> {
  const ctx = await requireOrg();
  const bill = await prisma.bill.findUnique({ where: { id } });
  assertOrg(bill, ctx.organizationId);
  if (bill!.status !== "DRAFT") {
    throw new Error("Only draft bills can be deleted. Void posted bills instead.");
  }
  await prisma.bill.delete({ where: { id } });
  revalidatePath("/bills");
  redirect("/bills");
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  );
}
