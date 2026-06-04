import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { postInvoiceIssued, trialBalance } from "@/lib/ledger";
import { assertOrg } from "@/lib/scope";
import { createTestOrg, cleanupOrg } from "./helpers";

let a: Awaited<ReturnType<typeof createTestOrg>>;
let b: Awaited<ReturnType<typeof createTestOrg>>;

beforeAll(async () => {
  a = await createTestOrg("tenantA");
  b = await createTestOrg("tenantB");

  // Post activity in A only.
  await prisma.$transaction((tx) =>
    postInvoiceIssued(tx, {
      organizationId: a.orgId,
      invoiceId: "a-inv-1",
      date: new Date(),
      number: "A-INV-001",
      totalCents: 10000,
      taxCents: 0,
      incomeLines: [{ accountId: a.accounts.income.id, amountCents: 10000 }],
    })
  );
});

afterAll(async () => {
  await cleanupOrg(a.orgId);
  await cleanupOrg(b.orgId);
  await prisma.$disconnect();
});

describe("strict tenant isolation", () => {
  it("trial balance for org B does not see org A's ledger", async () => {
    const tbA = await trialBalance(a.orgId);
    const tbB = await trialBalance(b.orgId);

    expect(tbA.rows.length).toBeGreaterThan(0);
    expect(tbA.totalDebitCents).toBe(10000);

    // B has no activity, so its trial balance is empty.
    expect(tbB.rows.length).toBe(0);
    expect(tbB.totalDebitCents).toBe(0);
  });

  it("an org-scoped journal query never returns another tenant's rows", async () => {
    const bEntries = await prisma.journalEntry.findMany({
      where: { organizationId: b.orgId },
    });
    expect(bEntries.length).toBe(0);

    // Sanity: the rows DO exist globally — proving the filter, not absence of data.
    const allEntries = await prisma.journalEntry.findMany({
      where: { organizationId: { in: [a.orgId, b.orgId] } },
    });
    expect(allEntries.length).toBeGreaterThan(0);
    expect(allEntries.every((e) => e.organizationId !== b.orgId)).toBe(true);
  });

  it("assertOrg rejects a record owned by a different tenant", () => {
    const aRecord = { organizationId: a.orgId, id: "x" };
    expect(() => assertOrg(aRecord, b.orgId)).toThrow(/not found/i);
    expect(() => assertOrg(aRecord, a.orgId)).not.toThrow();
  });

  it("fetching org A's account by id under org B's scope returns nothing", async () => {
    // The canonical scoped read pattern: filter by both id and organizationId.
    const leaked = await prisma.account.findFirst({
      where: { id: a.accounts.income.id, organizationId: b.orgId },
    });
    expect(leaked).toBeNull();
  });
});
