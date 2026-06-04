"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, requireOrg, assertOrg } from "@/lib/tenant";
import { dec, toCents } from "@/lib/money";

export type ReconcileFormState = { error?: string };

/** Already-reconciled balance = sum of amounts assigned to completed recs. */
async function reconciledBalanceCents(organizationId: string, bankAccountId: string) {
  const agg = await prisma.bankTransaction.aggregate({
    where: { organizationId, bankAccountId, reconciliationId: { not: null } },
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents ?? 0;
}

export async function startReconciliation(
  bankAccountId: string,
  _prev: ReconcileFormState,
  formData: FormData
): Promise<ReconcileFormState> {
  const ctx = await requireOrg();
  const bank = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
  assertOrg(bank, ctx.organizationId);

  const existing = await prisma.reconciliation.findFirst({
    where: { organizationId: ctx.organizationId, bankAccountId, status: "IN_PROGRESS" },
  });
  if (existing) redirect(`/banking/${bankAccountId}/reconcile`);

  const statementDate = String(formData.get("statementDate") ?? "");
  const statementBalance = Number(formData.get("statementBalance"));
  if (!statementDate || isNaN(statementBalance)) {
    return { error: "Enter a statement date and ending balance." };
  }

  const beginning = await reconciledBalanceCents(ctx.organizationId, bankAccountId);
  await prisma.reconciliation.create({
    data: {
      organizationId: ctx.organizationId,
      bankAccountId,
      statementDate: new Date(statementDate),
      statementBalanceCents: toCents(dec(statementBalance).times(100)),
      beginningBalanceCents: beginning,
    },
  });
  revalidatePath(`/banking/${bankAccountId}/reconcile`);
  return {};
}

/** Toggle a transaction's cleared flag during an in-progress reconciliation. */
export async function toggleCleared(
  bankAccountId: string,
  txnId: string
): Promise<void> {
  const ctx = await requireOrg();
  const txn = await prisma.bankTransaction.findUnique({ where: { id: txnId } });
  assertOrg(txn, ctx.organizationId);
  if (txn!.reconciliationId) return; // already reconciled into a completed rec
  await prisma.bankTransaction.update({
    where: { id: txnId },
    data: { isCleared: !txn!.isCleared },
  });
  revalidatePath(`/banking/${bankAccountId}/reconcile`);
}

export async function finishReconciliation(
  bankAccountId: string,
  reconciliationId: string
): Promise<void> {
  const ctx = await requireOrg();
  const rec = await prisma.reconciliation.findUnique({ where: { id: reconciliationId } });
  assertOrg(rec, ctx.organizationId);
  if (rec!.status !== "IN_PROGRESS") return;

  const cleared = await prisma.bankTransaction.aggregate({
    where: { organizationId: ctx.organizationId, bankAccountId, isCleared: true, reconciliationId: null },
    _sum: { amountCents: true },
  });
  const clearedSum = cleared._sum.amountCents ?? 0;
  const difference = rec!.statementBalanceCents - (rec!.beginningBalanceCents + clearedSum);
  if (difference !== 0) {
    throw new Error("Cannot finish: the difference must be zero.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.bankTransaction.updateMany({
      where: { organizationId: ctx.organizationId, bankAccountId, isCleared: true, reconciliationId: null },
      data: { reconciliationId },
    });
    await tx.reconciliation.update({
      where: { id: reconciliationId },
      data: { status: "COMPLETED", reconciledAt: new Date() },
    });
  });
  revalidatePath(`/banking/${bankAccountId}/reconcile`);
  redirect(`/banking/${bankAccountId}`);
}

export async function cancelReconciliation(
  bankAccountId: string,
  reconciliationId: string
): Promise<void> {
  const ctx = await requireOrg();
  const rec = await prisma.reconciliation.findUnique({ where: { id: reconciliationId } });
  assertOrg(rec, ctx.organizationId);

  await prisma.$transaction(async (tx) => {
    // Un-clear anything toggled during this in-progress session.
    await tx.bankTransaction.updateMany({
      where: { organizationId: ctx.organizationId, bankAccountId, reconciliationId: null, isCleared: true },
      data: { isCleared: false },
    });
    await tx.reconciliation.delete({ where: { id: reconciliationId } });
  });
  revalidatePath(`/banking/${bankAccountId}/reconcile`);
}
