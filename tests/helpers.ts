import { prisma } from "@/lib/prisma";

/**
 * Build a minimal, isolated organization with the key system accounts plus an
 * income and an expense account. Returns ids the ledger tests need.
 */
export async function createTestOrg(label: string) {
  const org = await prisma.organization.create({
    data: { name: `Test Org ${label} ${Date.now()}-${Math.random()}` },
  });

  const mk = (
    code: string,
    name: string,
    type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE",
    systemRole?: "AR" | "AP" | "CASH" | "SALES_TAX_PAYABLE" | "RETAINED_EARNINGS"
  ) =>
    prisma.account.create({
      data: {
        organizationId: org.id,
        code,
        name,
        type,
        subtype: type,
        systemRole: systemRole ?? null,
      },
    });

  const ar = await mk("1100", "Accounts Receivable", "ASSET", "AR");
  const ap = await mk("2000", "Accounts Payable", "LIABILITY", "AP");
  const cash = await mk("1001", "Operating Account", "ASSET", "CASH");
  const tax = await mk("2100", "Sales Tax Payable", "LIABILITY", "SALES_TAX_PAYABLE");
  const income = await mk("4000", "Sales Revenue", "INCOME");
  const expense = await mk("6000", "Office Expense", "EXPENSE");

  return {
    orgId: org.id,
    accounts: { ar, ap, cash, tax, income, expense },
  };
}

export async function cleanupOrg(orgId: string) {
  // Remove ledger first (JournalLine -> Account FK isn't cascade-on-org), then
  // the org cascades the rest (accounts, contacts, documents).
  await prisma.journalEntry.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
}
