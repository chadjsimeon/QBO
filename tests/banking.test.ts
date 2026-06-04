import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { postBankTransaction, reverseEntry, trialBalance } from "@/lib/ledger";
import { bookBalanceCents } from "@/lib/banking";
import { createTestOrg, cleanupOrg } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestOrg>>;

beforeAll(async () => {
  ctx = await createTestOrg("banking");
});

afterAll(async () => {
  await cleanupOrg(ctx.orgId);
  await prisma.$disconnect();
});

async function entryBalanced(entryId: string) {
  const lines = await prisma.journalLine.findMany({ where: { journalEntryId: entryId } });
  const debits = lines.reduce((s, l) => s + l.debitCents, 0);
  const credits = lines.reduce((s, l) => s + l.creditCents, 0);
  expect(lines.length).toBeGreaterThanOrEqual(2);
  expect(debits).toBe(credits);
  return { debits, credits };
}

describe("postBankTransaction", () => {
  it("posts a balanced deposit (money in): debit cash, credit income", async () => {
    const entry = await prisma.$transaction((tx) =>
      postBankTransaction(tx, {
        organizationId: ctx.orgId,
        bankTransactionId: "bt-deposit",
        date: new Date("2026-02-05"),
        bankGlAccountId: ctx.accounts.cash.id,
        amountCents: 10000,
        splits: [{ accountId: ctx.accounts.income.id, amountCents: 10000 }],
        memo: "Deposit",
      })
    );
    const { debits } = await entryBalanced(entry.id);
    expect(debits).toBe(10000);
    expect((await trialBalance(ctx.orgId)).balanced).toBe(true);
  });

  it("posts a balanced withdrawal (money out): debit expense, credit cash", async () => {
    const entry = await prisma.$transaction((tx) =>
      postBankTransaction(tx, {
        organizationId: ctx.orgId,
        bankTransactionId: "bt-withdrawal",
        date: new Date("2026-02-10"),
        bankGlAccountId: ctx.accounts.cash.id,
        amountCents: -5000,
        splits: [{ accountId: ctx.accounts.expense.id, amountCents: 5000 }],
      })
    );
    await entryBalanced(entry.id);
    expect((await trialBalance(ctx.orgId)).balanced).toBe(true);
  });

  it("supports a multi-way split that still balances", async () => {
    const entry = await prisma.$transaction((tx) =>
      postBankTransaction(tx, {
        organizationId: ctx.orgId,
        bankTransactionId: "bt-split",
        date: new Date("2026-02-12"),
        bankGlAccountId: ctx.accounts.cash.id,
        amountCents: -10000,
        splits: [
          { accountId: ctx.accounts.expense.id, amountCents: 6000 },
          { accountId: ctx.accounts.tax.id, amountCents: 4000 },
        ],
      })
    );
    await entryBalanced(entry.id);
    expect((await trialBalance(ctx.orgId)).balanced).toBe(true);
  });

  it("rejects a split whose total != the transaction amount", async () => {
    await expect(
      prisma.$transaction((tx) =>
        postBankTransaction(tx, {
          organizationId: ctx.orgId,
          bankTransactionId: "bt-bad",
          date: new Date(),
          bankGlAccountId: ctx.accounts.cash.id,
          amountCents: -10000,
          splits: [{ accountId: ctx.accounts.expense.id, amountCents: 9000 }],
        })
      )
    ).rejects.toThrow(/must equal the transaction amount/i);
  });
});

describe("categorize then undo (reversal)", () => {
  it("reverses the bank JE and leaves the books balanced", async () => {
    const entry = await prisma.$transaction((tx) =>
      postBankTransaction(tx, {
        organizationId: ctx.orgId,
        bankTransactionId: "bt-undo",
        date: new Date("2026-02-15"),
        bankGlAccountId: ctx.accounts.cash.id,
        amountCents: 7000,
        splits: [{ accountId: ctx.accounts.income.id, amountCents: 7000 }],
      })
    );
    const reversal = await prisma.$transaction((tx) =>
      reverseEntry(tx, ctx.orgId, entry.id, new Date())
    );
    expect(reversal.isReversal).toBe(true);
    expect(reversal.reversedEntryId).toBe(entry.id);
    expect((await trialBalance(ctx.orgId)).balanced).toBe(true);
  });
});

describe("bookBalanceCents", () => {
  it("equals the ledger net debit for the bank GL account", async () => {
    const book = await bookBalanceCents(ctx.orgId, ctx.accounts.cash.id);
    const tb = await trialBalance(ctx.orgId);
    const cashRow = tb.rows.find((r) => r.accountId === ctx.accounts.cash.id);
    expect(book).toBe(cashRow?.netDebitCents ?? 0);
  });
});

describe("reconciliation arithmetic", () => {
  it("difference reaches zero when cleared transactions sum to the statement", async () => {
    const bank = await prisma.bankAccount.create({
      data: {
        organizationId: ctx.orgId,
        accountId: ctx.accounts.cash.id,
        institutionName: "Test Bank",
        accountMask: "0001",
      },
    });
    await prisma.bankTransaction.createMany({
      data: [
        { organizationId: ctx.orgId, bankAccountId: bank.id, date: new Date(), descriptionRaw: "A", amountCents: 10000, isCleared: true },
        { organizationId: ctx.orgId, bankAccountId: bank.id, date: new Date(), descriptionRaw: "B", amountCents: -3000, isCleared: true },
        { organizationId: ctx.orgId, bankAccountId: bank.id, date: new Date(), descriptionRaw: "C", amountCents: -2000, isCleared: false },
      ],
    });
    const cleared = await prisma.bankTransaction.aggregate({
      where: { organizationId: ctx.orgId, bankAccountId: bank.id, isCleared: true },
      _sum: { amountCents: true },
    });
    const beginning = 0;
    const statementBalance = 7000; // 10000 - 3000
    const difference = statementBalance - (beginning + (cleared._sum.amountCents ?? 0));
    expect(difference).toBe(0);
  });
});
