"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma, requireOrg, assertOrg } from "@/lib/tenant";
import { dec, toCents } from "@/lib/money";
import { postBankTransaction, reverseEntry } from "@/lib/ledger";

export type BankFormState = { error?: string };

// ── Connect / import ────────────────────────────────────────────────────────

export async function createBankAccount(
  _prev: BankFormState,
  formData: FormData
): Promise<BankFormState> {
  const ctx = await requireOrg();
  const accountId = String(formData.get("accountId") ?? "");
  const institutionName = String(formData.get("institutionName") ?? "").trim();
  const accountMask = String(formData.get("accountMask") ?? "").trim() || null;
  if (!accountId || !institutionName) return { error: "Account and institution are required." };

  const gl = await prisma.account.findUnique({ where: { id: accountId } });
  assertOrg(gl, ctx.organizationId);

  let id = "";
  try {
    const bank = await prisma.bankAccount.create({
      data: { organizationId: ctx.organizationId, accountId, institutionName, accountMask },
    });
    id = bank.id;
  } catch (e) {
    if (isUnique(e)) return { error: "That account is already connected." };
    throw e;
  }
  revalidatePath("/banking");
  redirect(`/banking/${id}`);
}

/** Parse "date,description,amount" CSV rows into FOR_REVIEW transactions. */
export async function importCsv(
  bankAccountId: string,
  _prev: BankFormState,
  formData: FormData
): Promise<BankFormState> {
  const ctx = await requireOrg();
  const bank = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
  assertOrg(bank, ctx.organizationId);

  const text = String(formData.get("csv") ?? "").trim();
  if (!text) return { error: "Paste some CSV rows first." };

  const rows: { date: Date; descriptionRaw: string; amountCents: number }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.split(",").map((c) => c.trim());
    if (cells.length < 3) continue;
    const [dateStr, desc, amountStr] = [cells[0], cells.slice(1, -1).join(",") || cells[1], cells[cells.length - 1]];
    const date = new Date(dateStr);
    const amount = Number(amountStr.replace(/[^0-9.\-]/g, ""));
    if (isNaN(date.getTime()) || isNaN(amount)) continue; // skip header / bad rows
    rows.push({ date, descriptionRaw: desc, amountCents: toCents(dec(amount).times(100)) });
  }
  if (rows.length === 0) return { error: "No valid rows found. Use: date,description,amount" };

  await prisma.bankTransaction.createMany({
    data: rows.map((r) => ({ organizationId: ctx.organizationId, bankAccountId, ...r })),
  });
  revalidatePath(`/banking/${bankAccountId}`);
  return {};
}

/** Drop a fixed batch of demo transactions into "For review". */
export async function loadSampleTransactions(bankAccountId: string): Promise<void> {
  const ctx = await requireOrg();
  const bank = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
  assertOrg(bank, ctx.organizationId);

  const d = (s: string) => new Date(s);
  const samples = [
    { date: "2026-03-02", descriptionRaw: "DEPOSIT - CONSULTING", amountCents: 60000 },
    { date: "2026-03-04", descriptionRaw: "AWS CLOUD SERVICES", amountCents: -9500 },
    { date: "2026-03-06", descriptionRaw: "OFFICE SUPPLIES CO", amountCents: -4200 },
    { date: "2026-03-08", descriptionRaw: "STRIPE PAYOUT", amountCents: 18000 },
    { date: "2026-03-10", descriptionRaw: "ELECTRIC UTILITY", amountCents: -7600 },
  ];
  await prisma.bankTransaction.createMany({
    data: samples.map((s) => ({
      organizationId: ctx.organizationId,
      bankAccountId,
      date: d(s.date),
      descriptionRaw: s.descriptionRaw,
      amountCents: s.amountCents,
    })),
  });
  revalidatePath(`/banking/${bankAccountId}`);
}

export async function addManualTransaction(
  bankAccountId: string,
  _prev: BankFormState,
  formData: FormData
): Promise<BankFormState> {
  const ctx = await requireOrg();
  const bank = await prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
  assertOrg(bank, ctx.organizationId);

  const schema = z.object({
    date: z.string().min(1),
    description: z.string().trim().min(1),
    direction: z.enum(["IN", "OUT"]),
    amount: z.coerce.number().positive(),
  });
  const parsed = schema.safeParse({
    date: formData.get("date"),
    description: formData.get("description"),
    direction: formData.get("direction"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid entry" };

  const magnitude = toCents(dec(parsed.data.amount).times(100));
  await prisma.bankTransaction.create({
    data: {
      organizationId: ctx.organizationId,
      bankAccountId,
      date: new Date(parsed.data.date),
      descriptionRaw: parsed.data.description,
      amountCents: parsed.data.direction === "IN" ? magnitude : -magnitude,
    },
  });
  revalidatePath(`/banking/${bankAccountId}`);
  return {};
}

// ── Review workflow ─────────────────────────────────────────────────────────

/** Categorize (Add): post a balanced JE for the bank line and mark it added. */
export async function categorizeTransaction(
  txnId: string,
  _prev: BankFormState,
  formData: FormData
): Promise<BankFormState> {
  const ctx = await requireOrg();
  const txn = await prisma.bankTransaction.findUnique({
    where: { id: txnId },
    include: { bankAccount: true },
  });
  assertOrg(txn, ctx.organizationId);
  if (txn!.status !== "FOR_REVIEW") return { error: "Only items in review can be categorized." };

  // Splits: [{ accountId, amount(dollars) }]. Single category = one split.
  let raw: { accountId?: string; amount?: number }[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("splits") ?? "[]"));
    raw = Array.isArray(parsed) ? parsed : [];
  } catch {
    raw = [];
  }
  const splits = raw
    .filter((s) => s.accountId && Number(s.amount) > 0)
    .map((s) => ({ accountId: String(s.accountId), amountCents: toCents(dec(Number(s.amount)).times(100)) }));
  if (splits.length === 0) return { error: "Pick a category and amount." };

  const magnitude = Math.abs(txn!.amountCents);
  const splitTotal = splits.reduce((s, x) => s + x.amountCents, 0);
  if (splitTotal !== magnitude) {
    return { error: `Split total must equal ${(magnitude / 100).toFixed(2)}.` };
  }

  const payeeVendorId = (String(formData.get("payeeVendorId") ?? "") || null) as string | null;
  const payeeCustomerId = (String(formData.get("payeeCustomerId") ?? "") || null) as string | null;
  const memo = String(formData.get("memo") ?? "").trim() || null;

  await prisma.$transaction(async (tx) => {
    const entry = await postBankTransaction(tx, {
      organizationId: ctx.organizationId,
      bankTransactionId: txn!.id,
      date: txn!.date,
      bankGlAccountId: txn!.bankAccount.accountId,
      amountCents: txn!.amountCents,
      splits,
      memo: memo ?? txn!.descriptionRaw,
    });
    await tx.bankTransaction.update({
      where: { id: txnId },
      data: {
        status: "CATEGORIZED",
        matchType: "ADDED",
        journalEntryId: entry.id,
        categorizedAccountId: splits.length === 1 ? splits[0].accountId : null,
        payeeVendorId,
        payeeCustomerId,
        memo,
      },
    });
  });

  revalidatePath(`/banking/${txn!.bankAccountId}`);
  return {};
}

/** Match: link the bank line to an existing journal entry (no new posting). */
export async function matchTransaction(
  txnId: string,
  _prev: BankFormState,
  formData: FormData
): Promise<BankFormState> {
  const ctx = await requireOrg();
  const txn = await prisma.bankTransaction.findUnique({ where: { id: txnId } });
  assertOrg(txn, ctx.organizationId);
  if (txn!.status !== "FOR_REVIEW") return { error: "Only items in review can be matched." };

  const journalEntryId = String(formData.get("journalEntryId") ?? "");
  if (!journalEntryId) return { error: "Select an entry to match." };
  const entry = await prisma.journalEntry.findUnique({ where: { id: journalEntryId } });
  assertOrg(entry, ctx.organizationId);

  await prisma.bankTransaction.update({
    where: { id: txnId },
    data: { status: "CATEGORIZED", matchType: "MATCHED", journalEntryId },
  });
  revalidatePath(`/banking/${txn!.bankAccountId}`);
  return {};
}

export async function excludeTransaction(txnId: string): Promise<void> {
  const ctx = await requireOrg();
  const txn = await prisma.bankTransaction.findUnique({ where: { id: txnId } });
  assertOrg(txn, ctx.organizationId);
  await prisma.bankTransaction.update({ where: { id: txnId }, data: { status: "EXCLUDED" } });
  revalidatePath(`/banking/${txn!.bankAccountId}`);
}

/** Send a transaction back to "For review", reversing any added JE. */
export async function undoTransaction(txnId: string): Promise<void> {
  const ctx = await requireOrg();
  const txn = await prisma.bankTransaction.findUnique({ where: { id: txnId } });
  assertOrg(txn, ctx.organizationId);

  await prisma.$transaction(async (tx) => {
    if (txn!.matchType === "ADDED" && txn!.journalEntryId) {
      await reverseEntry(tx, ctx.organizationId, txn!.journalEntryId, new Date(), "Undo bank categorization");
    }
    await tx.bankTransaction.update({
      where: { id: txnId },
      data: {
        status: "FOR_REVIEW",
        matchType: null,
        journalEntryId: null,
        categorizedAccountId: null,
        payeeVendorId: null,
        payeeCustomerId: null,
        memo: null,
      },
    });
  });
  revalidatePath(`/banking/${txn!.bankAccountId}`);
}

function isUnique(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002";
}
