import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { postInvoiceIssued, postBillEntered } from "@/lib/ledger";
import { profitAndLoss, balanceSheet, arAging } from "@/lib/reports";
import { createTestOrg, cleanupOrg } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestOrg>>;

beforeAll(async () => {
  ctx = await createTestOrg("reports");

  // Invoice: $100 income + $8.25 tax => AR 10825.
  await prisma.$transaction((tx) =>
    postInvoiceIssued(tx, {
      organizationId: ctx.orgId,
      invoiceId: "r-inv-1",
      date: new Date("2026-01-10"),
      number: "INV-R1",
      totalCents: 10825,
      taxCents: 825,
      incomeLines: [{ accountId: ctx.accounts.income.id, amountCents: 10000 }],
    })
  );

  // Bill: $50 expense => AP 5000.
  await prisma.$transaction((tx) =>
    postBillEntered(tx, {
      organizationId: ctx.orgId,
      billId: "r-bill-1",
      date: new Date("2026-01-20"),
      number: "BILL-R1",
      totalCents: 5000,
      taxCents: 0,
      expenseLines: [{ accountId: ctx.accounts.expense.id, amountCents: 5000 }],
    })
  );

  // Open invoice for aging.
  await prisma.invoice.create({
    data: {
      organizationId: ctx.orgId,
      customerId: (
        await prisma.customer.create({
          data: { organizationId: ctx.orgId, name: "Aging Cust" },
        })
      ).id,
      number: "INV-AGE",
      status: "SENT",
      issueDate: new Date("2026-01-01"),
      dueDate: new Date("2026-01-15"),
      subtotalCents: 7000,
      taxCents: 0,
      totalCents: 7000,
      balanceCents: 7000,
    },
  });
});

afterAll(async () => {
  await cleanupOrg(ctx.orgId);
  await prisma.$disconnect();
});

describe("Profit & Loss", () => {
  it("computes income, expenses, and net income from the ledger", async () => {
    const pl = await profitAndLoss(ctx.orgId, {});
    expect(pl.income.totalCents).toBe(10000);
    expect(pl.expenses.totalCents).toBe(5000);
    expect(pl.netIncomeCents).toBe(5000);
  });

  it("non-zero variant suppresses zero-activity accounts", async () => {
    const all = await profitAndLoss(ctx.orgId, {}, { nonZero: false });
    const nz = await profitAndLoss(ctx.orgId, {}, { nonZero: true });
    expect(nz.income.rows.length).toBeLessThanOrEqual(all.income.rows.length);
    expect(nz.income.rows.every((r) => r.amountCents !== 0)).toBe(true);
  });
});

describe("Balance Sheet", () => {
  it("balances: assets == liabilities + equity (incl. net income)", async () => {
    const bs = await balanceSheet(ctx.orgId, new Date("2026-12-31"));
    expect(bs.assets.totalCents).toBe(10825); // AR
    expect(bs.liabilities.totalCents).toBe(5825); // AP 5000 + tax 825
    expect(bs.netIncomeCents).toBe(5000);
    expect(bs.liabilitiesPlusEquityCents).toBe(10825);
    expect(bs.balanced).toBe(true);
  });
});

describe("A/R Aging", () => {
  it("buckets an overdue invoice by days past due", async () => {
    const aging = await arAging(ctx.orgId, new Date("2026-03-01"));
    expect(aging.totalCents).toBe(7000);
    // Due 2026-01-15, asOf 2026-03-01 => ~45 days overdue => bucket 2 (31–60).
    expect(aging.bucketTotals[2]).toBe(7000);
  });
});
