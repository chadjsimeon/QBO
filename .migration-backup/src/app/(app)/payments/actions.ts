"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma, requireOrg, assertOrg } from "@/lib/tenant";
import { dec, toCents } from "@/lib/money";
import { postPaymentReceived, postPaymentSent, reverseEntry } from "@/lib/ledger";

const allocationSchema = z.object({
  docId: z.string().min(1),
  amount: z.coerce.number().positive(),
});

const paymentSchema = z.object({
  direction: z.enum(["RECEIVED", "SENT"]),
  contactId: z.string().min(1, "Select a customer or vendor"),
  date: z.string().min(1, "Date required"),
  method: z.enum(["CASH", "CHECK", "CARD", "BANK_TRANSFER", "OTHER"]),
  memo: z.string().trim().optional(),
  allocations: z.array(allocationSchema).min(1, "Apply to at least one document"),
});

export type PaymentFormState = { error?: string };

export async function recordPayment(
  _prev: PaymentFormState,
  formData: FormData
): Promise<PaymentFormState> {
  const ctx = await requireOrg();

  let allocationsRaw: unknown[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("allocations") ?? "[]"));
    allocationsRaw = Array.isArray(parsed) ? parsed : [];
  } catch {
    allocationsRaw = [];
  }

  const parsed = paymentSchema.safeParse({
    direction: formData.get("direction"),
    contactId: formData.get("contactId"),
    date: formData.get("date"),
    method: formData.get("method"),
    memo: formData.get("memo"),
    allocations: allocationsRaw,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payment" };
  }
  const data = parsed.data;
  const received = data.direction === "RECEIVED";

  // Convert dollar inputs to cents.
  const allocs = data.allocations.map((a) => ({
    docId: a.docId,
    amountCents: toCents(dec(a.amount).times(100)),
  }));
  const totalCents = allocs.reduce((s, a) => s + a.amountCents, 0);
  if (totalCents <= 0) return { error: "Payment total must be greater than zero." };

  // Validate every target document: tenant + contact + open + amount <= balance.
  for (const a of allocs) {
    if (received) {
      const inv = await prisma.invoice.findUnique({ where: { id: a.docId } });
      assertOrg(inv, ctx.organizationId);
      if (inv!.customerId !== data.contactId) return { error: "Invoice does not belong to that customer." };
      if (a.amountCents > inv!.balanceCents) return { error: `Amount exceeds balance on ${inv!.number}.` };
    } else {
      const bill = await prisma.bill.findUnique({ where: { id: a.docId } });
      assertOrg(bill, ctx.organizationId);
      if (bill!.vendorId !== data.contactId) return { error: "Bill does not belong to that vendor." };
      if (a.amountCents > bill!.balanceCents) return { error: `Amount exceeds balance on ${bill!.number}.` };
    }
  }

  let paymentId = "";
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        organizationId: ctx.organizationId,
        direction: data.direction,
        customerId: received ? data.contactId : null,
        vendorId: received ? null : data.contactId,
        amountCents: totalCents,
        date: new Date(data.date),
        method: data.method,
        memo: data.memo || null,
        allocations: {
          create: allocs.map((a) => ({
            invoiceId: received ? a.docId : null,
            billId: received ? null : a.docId,
            amountCents: a.amountCents,
          })),
        },
      },
    });
    paymentId = payment.id;

    if (received) {
      await postPaymentReceived(tx, {
        organizationId: ctx.organizationId,
        paymentId: payment.id,
        date: payment.date,
        amountCents: totalCents,
      });
      for (const a of allocs) {
        const inv = await tx.invoice.findUniqueOrThrow({ where: { id: a.docId } });
        const newBalance = inv.balanceCents - a.amountCents;
        await tx.invoice.update({
          where: { id: a.docId },
          data: { balanceCents: newBalance, status: newBalance <= 0 ? "PAID" : "PARTIAL" },
        });
      }
    } else {
      await postPaymentSent(tx, {
        organizationId: ctx.organizationId,
        paymentId: payment.id,
        date: payment.date,
        amountCents: totalCents,
      });
      for (const a of allocs) {
        const bill = await tx.bill.findUniqueOrThrow({ where: { id: a.docId } });
        const newBalance = bill.balanceCents - a.amountCents;
        await tx.bill.update({
          where: { id: a.docId },
          data: { balanceCents: newBalance, status: newBalance <= 0 ? "PAID" : "PARTIAL" },
        });
      }
    }
  });

  revalidatePath("/payments");
  redirect(`/payments/${paymentId}`);
}

/** Delete a payment: reverse its ledger entry and restore document balances. */
export async function deletePayment(id: string): Promise<void> {
  const ctx = await requireOrg();
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { allocations: true },
  });
  assertOrg(payment, ctx.organizationId);

  await prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.findFirst({
      where: { organizationId: ctx.organizationId, sourceType: "PAYMENT", sourceId: id, isReversal: false },
    });
    if (entry) {
      await reverseEntry(tx, ctx.organizationId, entry.id, new Date(), "Reversal of payment");
    }
    // Restore balances/status on each allocated document.
    for (const a of payment!.allocations) {
      if (a.invoiceId) {
        const inv = await tx.invoice.findUniqueOrThrow({ where: { id: a.invoiceId } });
        const restored = inv.balanceCents + a.amountCents;
        await tx.invoice.update({
          where: { id: a.invoiceId },
          data: { balanceCents: restored, status: restored >= inv.totalCents ? "SENT" : "PARTIAL" },
        });
      } else if (a.billId) {
        const bill = await tx.bill.findUniqueOrThrow({ where: { id: a.billId } });
        const restored = bill.balanceCents + a.amountCents;
        await tx.bill.update({
          where: { id: a.billId },
          data: { balanceCents: restored, status: restored >= bill.totalCents ? "OPEN" : "PARTIAL" },
        });
      }
    }
    await tx.payment.delete({ where: { id } });
  });

  revalidatePath("/payments");
  redirect("/payments");
}
