/**
 * Prisma seed — QuickBooks-style accounting app
 *
 * Creates: one organization, an owner user (with a login password) + membership,
 * a default tax rate, a standard *hierarchical* chart of accounts (parent/child
 * with subtotals), a sample customer and vendor, and one saved Management Report
 * template (cover + P&L Non-Zero + Balance Sheet) mirroring a treasurer's report.
 *
 * Account codes are user-defined strings (can be long, e.g. "5114744").
 * Key accounts the ledger engine must locate are tagged via `systemRole`,
 * never by code.
 *
 * Run with:  npm run db:seed   (npx prisma db seed)
 *
 * Login after seeding:  owner@acme.test  /  password123
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
type SystemRole =
  | "AR"
  | "AP"
  | "CASH"
  | "SALES_TAX_PAYABLE"
  | "RETAINED_EARNINGS"
  | null;
type CashFlow = "OPERATING" | "INVESTING" | "FINANCING" | "NONE";

interface SeedAccount {
  code: string;
  name: string;
  type: AccountType;
  subtype: string;
  systemRole?: SystemRole;
  cashFlowCategory?: CashFlow;
  children?: SeedAccount[];
}

// Hierarchical chart of accounts. Parents that contain children render a
// "Total for <name>" subtotal in reports. Defaults are sensible; the user edits them.
const CHART_OF_ACCOUNTS: SeedAccount[] = [
  // ── Assets ───────────────────────────────────────────────
  {
    code: "1000",
    name: "Cash and Bank",
    type: "ASSET",
    subtype: "Bank",
    cashFlowCategory: "NONE", // cash itself is the reconciling line, not a flow
    children: [
      { code: "1001", name: "Operating Account", type: "ASSET", subtype: "Bank", systemRole: "CASH", cashFlowCategory: "NONE" },
      { code: "1002", name: "Savings / USD Account", type: "ASSET", subtype: "Bank", cashFlowCategory: "NONE" },
    ],
  },
  { code: "1100", name: "Accounts Receivable", type: "ASSET", subtype: "Receivable", systemRole: "AR", cashFlowCategory: "OPERATING" },
  { code: "1200", name: "Inventory", type: "ASSET", subtype: "Current Asset", cashFlowCategory: "OPERATING" },
  { code: "1300", name: "Prepaid Expenses", type: "ASSET", subtype: "Current Asset", cashFlowCategory: "OPERATING" },
  {
    code: "1500",
    name: "Fixed Assets",
    type: "ASSET",
    subtype: "Fixed Asset",
    cashFlowCategory: "INVESTING",
    children: [
      { code: "1510", name: "Equipment", type: "ASSET", subtype: "Fixed Asset", cashFlowCategory: "INVESTING" },
      { code: "1520", name: "Accumulated Depreciation", type: "ASSET", subtype: "Fixed Asset", cashFlowCategory: "INVESTING" },
    ],
  },

  // ── Liabilities ──────────────────────────────────────────
  {
    code: "2000",
    name: "Accounts Payable",
    type: "LIABILITY",
    subtype: "Payable",
    systemRole: "AP",
    cashFlowCategory: "OPERATING",
    children: [
      { code: "2001", name: "Accounts Payable - Other", type: "LIABILITY", subtype: "Payable", cashFlowCategory: "OPERATING" },
      { code: "2002", name: "Accrued Expenses", type: "LIABILITY", subtype: "Payable", cashFlowCategory: "OPERATING" },
    ],
  },
  { code: "2100", name: "Sales Tax Payable", type: "LIABILITY", subtype: "Tax", systemRole: "SALES_TAX_PAYABLE", cashFlowCategory: "OPERATING" },
  { code: "2200", name: "Credit Card", type: "LIABILITY", subtype: "Current Liability", cashFlowCategory: "OPERATING" },
  { code: "2300", name: "Loans Payable", type: "LIABILITY", subtype: "Long Term Liability", cashFlowCategory: "FINANCING" },

  // ── Equity ───────────────────────────────────────────────
  { code: "3000", name: "Opening Balance Equity", type: "EQUITY", subtype: "Equity", cashFlowCategory: "FINANCING" },
  { code: "3100", name: "Owner's Draws", type: "EQUITY", subtype: "Equity", cashFlowCategory: "FINANCING" },
  { code: "3900", name: "Retained Earnings", type: "EQUITY", subtype: "Equity", systemRole: "RETAINED_EARNINGS", cashFlowCategory: "FINANCING" },

  // ── Income ───────────────────────────────────────────────
  { code: "4000", name: "Sales Revenue", type: "INCOME", subtype: "Operating Income", cashFlowCategory: "OPERATING" },
  { code: "4100", name: "Service Revenue", type: "INCOME", subtype: "Operating Income", cashFlowCategory: "OPERATING" },
  { code: "4900", name: "Other Income", type: "INCOME", subtype: "Other Income", cashFlowCategory: "OPERATING" },

  // ── Cost of Goods Sold ───────────────────────────────────
  { code: "5000", name: "Cost of Goods Sold", type: "EXPENSE", subtype: "Cost of Goods Sold", cashFlowCategory: "OPERATING" },

  // ── Expenses (with a nested group to demonstrate subtotals) ─
  { code: "6000", name: "Advertising & Marketing", type: "EXPENSE", subtype: "Operating Expense", cashFlowCategory: "OPERATING" },
  { code: "6100", name: "Bank & Merchant Fees", type: "EXPENSE", subtype: "Operating Expense", cashFlowCategory: "OPERATING" },
  {
    code: "6300",
    name: "Programmes",
    type: "EXPENSE",
    subtype: "Operating Expense",
    cashFlowCategory: "OPERATING",
    children: [
      { code: "6301", name: "Programmes - Youth Development", type: "EXPENSE", subtype: "Operating Expense", cashFlowCategory: "OPERATING" },
      { code: "6302", name: "Programmes - Get Into Rugby", type: "EXPENSE", subtype: "Operating Expense", cashFlowCategory: "OPERATING" },
    ],
  },
  { code: "6400", name: "Rent", type: "EXPENSE", subtype: "Operating Expense", cashFlowCategory: "OPERATING" },
  { code: "6500", name: "Software & Subscriptions", type: "EXPENSE", subtype: "Operating Expense", cashFlowCategory: "OPERATING" },
  { code: "6600", name: "Travel & Meals", type: "EXPENSE", subtype: "Operating Expense", cashFlowCategory: "OPERATING" },
  { code: "6700", name: "Utilities", type: "EXPENSE", subtype: "Operating Expense", cashFlowCategory: "OPERATING" },
  { code: "6800", name: "Professional Fees", type: "EXPENSE", subtype: "Operating Expense", cashFlowCategory: "OPERATING" },
  { code: "6900", name: "Miscellaneous Expense", type: "EXPENSE", subtype: "Operating Expense", cashFlowCategory: "OPERATING" },
];

// Recursively insert accounts, wiring parentId and sortOrder.
async function insertAccounts(
  orgId: string,
  accounts: SeedAccount[],
  parentId: string | null = null
) {
  let order = 0;
  for (const a of accounts) {
    const created = await prisma.account.create({
      data: {
        organizationId: orgId,
        code: a.code,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        systemRole: a.systemRole ?? null,
        cashFlowCategory: a.cashFlowCategory ?? "NONE",
        parentId,
        sortOrder: order++,
        isActive: true,
      },
    });
    if (a.children?.length) {
      await insertAccounts(orgId, a.children, created.id);
    }
  }
}

function countAccounts(accounts: SeedAccount[]): number {
  return accounts.reduce(
    (n, a) => n + 1 + (a.children ? countAccounts(a.children) : 0),
    0
  );
}

async function main() {
  // Idempotent reseed: clear the demo org if it already exists.
  const existing = await prisma.organization.findFirst({
    where: { name: "Acme Demo Co." },
  });
  if (existing) {
    await prisma.organization.delete({ where: { id: existing.id } });
  }

  // Organization (tenant root)
  const org = await prisma.organization.create({
    data: { name: "Acme Demo Co." },
  });

  // Owner user + membership (login: owner@acme.test / password123)
  const passwordHash = await bcrypt.hash("password123", 10);
  const user = await prisma.user.upsert({
    where: { email: "owner@acme.test" },
    update: { passwordHash, name: "Demo Owner" },
    create: { email: "owner@acme.test", name: "Demo Owner", passwordHash },
  });
  await prisma.orgMembership.create({
    data: { userId: user.id, organizationId: org.id, role: "OWNER" },
  });

  // Default tax rate — 8.25% expressed in basis points
  await prisma.taxRate.create({
    data: { organizationId: org.id, name: "Sales Tax (8.25%)", rateBps: 825 },
  });

  // Hierarchical chart of accounts
  await insertAccounts(org.id, CHART_OF_ACCOUNTS);

  // Sample customer and vendor
  await prisma.customer.create({
    data: {
      organizationId: org.id,
      name: "Globex Corporation",
      email: "ap@globex.test",
      phone: "555-0100",
      billingAddress: "100 Main St, Springfield",
    },
  });
  await prisma.vendor.create({
    data: {
      organizationId: org.id,
      name: "Initech Supplies",
      email: "billing@initech.test",
      phone: "555-0200",
      address: "200 Market St, Springfield",
    },
  });

  // Sample saved Management Report template (cover + two sections)
  const report = await prisma.managementReport.create({
    data: {
      organizationId: org.id,
      name: "Treasurer's Report",
      periodPreset: "THIS_YEAR_TO_DATE",
      basis: "ACCRUAL",
      preparedByName: "Demo Owner",
      confidentialityNote: "Management Committee Only",
    },
  });
  await prisma.managementReportSection.createMany({
    data: [
      { managementReportId: report.id, reportType: "PROFIT_LOSS_NONZERO", sortOrder: 0 },
      { managementReportId: report.id, reportType: "BALANCE_SHEET", sortOrder: 1 },
    ],
  });

  console.log(
    `Seeded org "${org.name}" (${org.id}) with ` +
      `${countAccounts(CHART_OF_ACCOUNTS)} accounts (nested), 1 customer, 1 vendor, ` +
      `and 1 management report template.\n` +
      `Login: owner@acme.test / password123`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
