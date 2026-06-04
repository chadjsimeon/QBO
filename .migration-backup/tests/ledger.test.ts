import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  postInvoiceIssued,
  postBillEntered,
  postPaymentReceived,
  reverseEntry,
  trialBalance,
  validateLines,
  postEntry,
} from "@/lib/ledger";
import { createTestOrg, cleanupOrg } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestOrg>>;

beforeAll(async () => {
  ctx = await createTestOrg("ledger");
});

afterAll(async () => {
  await cleanupOrg(ctx.orgId);
  await prisma.$disconnect();
});

/** Re-fetch an entry's lines and assert sum(debit) == sum(credit). */
async function assertEntryBalanced(entryId: string) {
  const lines = await prisma.journalLine.findMany({
    where: { journalEntryId: entryId },
  });
  const debits = lines.reduce((s, l) => s + l.debitCents, 0);
  const credits = lines.reduce((s, l) => s + l.creditCents, 0);
  expect(lines.length).toBeGreaterThanOrEqual(2);
  expect(debits).toBe(credits);
}

describe("validateLines", () => {
  it("rejects an unbalanced entry", () => {
    expect(() =>
      validateLines([
        { accountId: "a", debitCents: 100, creditCents: 0 },
        { accountId: "b", debitCents: 0, creditCents: 90 },
      ])
    ).toThrow(/unbalanced/i);
  });

  it("rejects a line with both debit and credit set", () => {
    expect(() =>
      validateLines([
        { accountId: "a", debitCents: 100, creditCents: 100 },
        { accountId: "b", debitCents: 0, creditCents: 100 },
      ])
    ).toThrow(/exactly one/i);
  });

  it("rejects fewer than two lines", () => {
    expect(() =>
      validateLines([{ accountId: "a", debitCents: 100, creditCents: 0 }])
    ).toThrow(/at least 2/i);
  });

  it("accepts a balanced entry", () => {
    expect(() =>
      validateLines([
        { accountId: "a", debitCents: 100, creditCents: 0 },
        { accountId: "b", debitCents: 0, creditCents: 100 },
      ])
    ).not.toThrow();
  });
});

describe("posting operations keep the books balanced", () => {
  it("invoice issued posts a balanced entry and trial balance balances", async () => {
    const entry = await prisma.$transaction((tx) =>
      postInvoiceIssued(tx, {
        organizationId: ctx.orgId,
        invoiceId: "inv-1",
        date: new Date(),
        number: "INV-001",
        totalCents: 10825, // 10000 + 825 tax
        taxCents: 825,
        incomeLines: [{ accountId: ctx.accounts.income.id, amountCents: 10000 }],
      })
    );
    await assertEntryBalanced(entry.id);

    const tb = await trialBalance(ctx.orgId);
    expect(tb.balanced).toBe(true);
    // AR should be a net debit of the invoice total.
    const arRow = tb.rows.find((r) => r.accountId === ctx.accounts.ar.id);
    expect(arRow?.netDebitCents).toBe(10825);
  });

  it("bill entered posts a balanced entry; trial balance still balances", async () => {
    const entry = await prisma.$transaction((tx) =>
      postBillEntered(tx, {
        organizationId: ctx.orgId,
        billId: "bill-1",
        date: new Date(),
        number: "BILL-001",
        totalCents: 5000,
        taxCents: 0,
        expenseLines: [{ accountId: ctx.accounts.expense.id, amountCents: 5000 }],
      })
    );
    await assertEntryBalanced(entry.id);
    const tb = await trialBalance(ctx.orgId);
    expect(tb.balanced).toBe(true);
  });

  it("payment received posts a balanced entry; trial balance still balances", async () => {
    const entry = await prisma.$transaction((tx) =>
      postPaymentReceived(tx, {
        organizationId: ctx.orgId,
        paymentId: "pay-1",
        date: new Date(),
        amountCents: 10825,
      })
    );
    await assertEntryBalanced(entry.id);
    const tb = await trialBalance(ctx.orgId);
    expect(tb.balanced).toBe(true);
    // After full payment, AR nets to zero.
    const arRow = tb.rows.find((r) => r.accountId === ctx.accounts.ar.id);
    expect(arRow?.netDebitCents).toBe(0);
  });

  it("a reversal flips debits/credits and nets the source entry to zero", async () => {
    const original = await prisma.$transaction((tx) =>
      postEntry(tx, {
        organizationId: ctx.orgId,
        date: new Date(),
        sourceType: "MANUAL",
        memo: "manual adj",
        lines: [
          { accountId: ctx.accounts.expense.id, debitCents: 2500, creditCents: 0 },
          { accountId: ctx.accounts.cash.id, debitCents: 0, creditCents: 2500 },
        ],
      })
    );

    const reversal = await prisma.$transaction((tx) =>
      reverseEntry(tx, ctx.orgId, original.id, new Date())
    );
    await assertEntryBalanced(reversal.id);
    expect(reversal.isReversal).toBe(true);
    expect(reversal.reversedEntryId).toBe(original.id);

    // The reversal's lines mirror the original with debit/credit swapped.
    const origLines = await prisma.journalLine.findMany({
      where: { journalEntryId: original.id },
      orderBy: { accountId: "asc" },
    });
    const revLines = await prisma.journalLine.findMany({
      where: { journalEntryId: reversal.id },
      orderBy: { accountId: "asc" },
    });
    for (let i = 0; i < origLines.length; i++) {
      expect(revLines[i].debitCents).toBe(origLines[i].creditCents);
      expect(revLines[i].creditCents).toBe(origLines[i].debitCents);
    }
  });

  it("trial balance always balances after every operation above", async () => {
    const tb = await trialBalance(ctx.orgId);
    expect(tb.totalDebitCents).toBe(tb.totalCreditCents);
    expect(tb.balanced).toBe(true);
  });
});
