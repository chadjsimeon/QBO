import { db, pool } from "../lib/db/src/index.js";
import * as schema from "../lib/db/src/schema/index.js";
import bcrypt from "bcryptjs";

async function main() {
  console.log("🌱 Seeding Ledgerly demo data…");

  const [org] = await db.insert(schema.organizations).values({
    name: "Acme Corp",
  }).returning();
  console.log("  org:", org.id);

  const hash = await bcrypt.hash("password123", 12);
  const [user] = await db.insert(schema.users).values({
    email: "owner@acme.test",
    name: "Alex Owner",
    passwordHash: hash,
  }).returning();
  console.log("  user:", user.id);

  await db.insert(schema.orgMemberships).values({
    userId: user.id,
    organizationId: org.id,
    role: "OWNER",
  });

  const accts = await db.insert(schema.accounts).values([
    { organizationId: org.id, code: "1000", name: "Assets",               type: "ASSET",     subtype: "header",       sortOrder: 100 },
    { organizationId: org.id, code: "1010", name: "Checking Account",     type: "ASSET",     subtype: "bank",         sortOrder: 110, systemRole: "CASH" },
    { organizationId: org.id, code: "1020", name: "Savings Account",      type: "ASSET",     subtype: "bank",         sortOrder: 120 },
    { organizationId: org.id, code: "1100", name: "Accounts Receivable",  type: "ASSET",     subtype: "receivable",   sortOrder: 130, systemRole: "AR" },
    { organizationId: org.id, code: "1200", name: "Inventory",            type: "ASSET",     subtype: "inventory",    sortOrder: 140 },
    { organizationId: org.id, code: "2000", name: "Liabilities",          type: "LIABILITY", subtype: "header",       sortOrder: 200 },
    { organizationId: org.id, code: "2010", name: "Accounts Payable",     type: "LIABILITY", subtype: "payable",      sortOrder: 210, systemRole: "AP" },
    { organizationId: org.id, code: "2100", name: "Sales Tax Payable",    type: "LIABILITY", subtype: "tax",          sortOrder: 220, systemRole: "SALES_TAX_PAYABLE" },
    { organizationId: org.id, code: "2200", name: "Business Credit Card", type: "LIABILITY", subtype: "credit_card",  sortOrder: 230 },
    { organizationId: org.id, code: "3000", name: "Equity",               type: "EQUITY",    subtype: "header",       sortOrder: 300 },
    { organizationId: org.id, code: "3100", name: "Owner's Capital",      type: "EQUITY",    subtype: "equity",       sortOrder: 310 },
    { organizationId: org.id, code: "3200", name: "Retained Earnings",    type: "EQUITY",    subtype: "retained",     sortOrder: 320, systemRole: "RETAINED_EARNINGS" },
    { organizationId: org.id, code: "4000", name: "Income",               type: "INCOME",    subtype: "header",       sortOrder: 400 },
    { organizationId: org.id, code: "4100", name: "Services Revenue",     type: "INCOME",    subtype: "revenue",      sortOrder: 410 },
    { organizationId: org.id, code: "4200", name: "Product Sales",        type: "INCOME",    subtype: "revenue",      sortOrder: 420 },
    { organizationId: org.id, code: "4300", name: "Other Income",         type: "INCOME",    subtype: "revenue",      sortOrder: 430 },
    { organizationId: org.id, code: "5000", name: "Expenses",             type: "EXPENSE",   subtype: "header",       sortOrder: 500 },
    { organizationId: org.id, code: "5100", name: "Cost of Goods Sold",   type: "EXPENSE",   subtype: "cogs",         sortOrder: 510 },
    { organizationId: org.id, code: "5200", name: "Payroll",              type: "EXPENSE",   subtype: "payroll",      sortOrder: 520 },
    { organizationId: org.id, code: "5300", name: "Rent",                 type: "EXPENSE",   subtype: "facilities",   sortOrder: 530 },
    { organizationId: org.id, code: "5400", name: "Utilities",            type: "EXPENSE",   subtype: "utilities",    sortOrder: 540 },
    { organizationId: org.id, code: "5500", name: "Software & SaaS",      type: "EXPENSE",   subtype: "software",     sortOrder: 550 },
    { organizationId: org.id, code: "5600", name: "Travel & Meals",       type: "EXPENSE",   subtype: "travel",       sortOrder: 560 },
    { organizationId: org.id, code: "5700", name: "Marketing",            type: "EXPENSE",   subtype: "marketing",    sortOrder: 570 },
    { organizationId: org.id, code: "5800", name: "Professional Services",type: "EXPENSE",   subtype: "professional", sortOrder: 580 },
    { organizationId: org.id, code: "5900", name: "Bank Fees",            type: "EXPENSE",   subtype: "bank_fees",    sortOrder: 590 },
  ]).returning();

  const a = Object.fromEntries(accts.map(ac => [ac.code, ac]));
  console.log("  accounts:", accts.length);

  const [cust1, cust2, cust3] = await db.insert(schema.customers).values([
    { organizationId: org.id, name: "Globex Corporation", email: "ap@globex.example",       phone: "555-0101", billingAddress: "1 Globex Way, Springfield, IL" },
    { organizationId: org.id, name: "Initech LLC",        email: "billing@initech.example", phone: "555-0202" },
    { organizationId: org.id, name: "Umbrella Solutions", email: "finance@umbrella.example" },
  ]).returning();
  console.log("  customers:", 3);

  const [vend1, , vend3] = await db.insert(schema.vendors).values([
    { organizationId: org.id, name: "AWS",              email: "billing@aws.example", address: "410 Terry Ave N, Seattle, WA" },
    { organizationId: org.id, name: "Office Depot",     email: "ar@officedepot.example" },
    { organizationId: org.id, name: "City Power & Gas", email: "commercial@cpg.example" },
  ]).returning();
  console.log("  vendors:", 3);

  const d = (offset: number) => { const dt = new Date(); dt.setDate(dt.getDate() + offset); return dt; };

  const [inv1] = await db.insert(schema.invoices).values({
    organizationId: org.id, customerId: cust1.id, number: "INV-001", status: "SENT",
    issueDate: d(-30), dueDate: d(0), subtotalCents: 500000, taxCents: 41250, totalCents: 541250, balanceCents: 541250,
  }).returning();
  await db.insert(schema.invoiceLineItems).values({
    invoiceId: inv1.id, description: "Software consulting – Q2", quantity: 50,
    unitPriceCents: 10000, accountId: a["4100"].id, amountCents: 500000, sortOrder: 0,
  });

  const [inv2] = await db.insert(schema.invoices).values({
    organizationId: org.id, customerId: cust2.id, number: "INV-002", status: "PARTIAL",
    issueDate: d(-60), dueDate: d(-30), subtotalCents: 240000, taxCents: 0, totalCents: 240000, balanceCents: 120000,
  }).returning();
  await db.insert(schema.invoiceLineItems).values({
    invoiceId: inv2.id, description: "Annual support contract", quantity: 1,
    unitPriceCents: 240000, accountId: a["4100"].id, amountCents: 240000, sortOrder: 0,
  });

  const [inv3] = await db.insert(schema.invoices).values({
    organizationId: org.id, customerId: cust3.id, number: "INV-003", status: "DRAFT",
    issueDate: d(-2), dueDate: d(28), subtotalCents: 85000, taxCents: 7013, totalCents: 92013, balanceCents: 92013,
  }).returning();
  await db.insert(schema.invoiceLineItems).values({
    invoiceId: inv3.id, description: "Data migration project", quantity: 1,
    unitPriceCents: 85000, accountId: a["4100"].id, amountCents: 85000, sortOrder: 0,
  });
  console.log("  invoices:", 3);

  const [bill1] = await db.insert(schema.bills).values({
    organizationId: org.id, vendorId: vend1.id, number: "BILL-AWS-0624", status: "OPEN",
    issueDate: d(-5), dueDate: d(25), subtotalCents: 328400, taxCents: 0, totalCents: 328400, balanceCents: 328400,
  }).returning();
  await db.insert(schema.billLineItems).values([
    { billId: bill1.id, description: "EC2 instances", quantity: 1, unitPriceCents: 198400, accountId: a["5500"].id, amountCents: 198400, sortOrder: 0 },
    { billId: bill1.id, description: "S3 storage",    quantity: 1, unitPriceCents: 130000, accountId: a["5500"].id, amountCents: 130000, sortOrder: 1 },
  ]);

  const [bill2] = await db.insert(schema.bills).values({
    organizationId: org.id, vendorId: vend3.id, number: "BILL-CPG-0624", status: "OPEN",
    issueDate: d(-10), dueDate: d(20), subtotalCents: 42000, taxCents: 0, totalCents: 42000, balanceCents: 42000,
  }).returning();
  await db.insert(schema.billLineItems).values({
    billId: bill2.id, description: "Monthly utilities", quantity: 1,
    unitPriceCents: 42000, accountId: a["5400"].id, amountCents: 42000, sortOrder: 0,
  });
  console.log("  bills:", 2);

  const [pmt1] = await db.insert(schema.payments).values({
    organizationId: org.id, direction: "RECEIVED", customerId: cust2.id,
    amountCents: 120000, date: d(-10), method: "BANK_TRANSFER", memo: "Partial payment on INV-002",
  }).returning();
  await db.insert(schema.paymentAllocations).values({
    paymentId: pmt1.id, invoiceId: inv2.id, amountCents: 120000,
  });
  console.log("  payments:", 1);

  const [je1] = await db.insert(schema.journalEntries).values({
    organizationId: org.id, date: d(-90), memo: "Opening balance", sourceType: "MANUAL",
  }).returning();
  await db.insert(schema.journalLines).values([
    { journalEntryId: je1.id, accountId: a["1010"].id, debitCents: 5000000, creditCents: 0 },
    { journalEntryId: je1.id, accountId: a["3100"].id, debitCents: 0, creditCents: 5000000 },
  ]);

  const [je2] = await db.insert(schema.journalEntries).values({
    organizationId: org.id, date: d(-30), memo: "INV-001 issued", sourceType: "INVOICE", sourceId: inv1.id,
  }).returning();
  await db.insert(schema.journalLines).values([
    { journalEntryId: je2.id, accountId: a["1100"].id, debitCents: 541250, creditCents: 0 },
    { journalEntryId: je2.id, accountId: a["4100"].id, debitCents: 0, creditCents: 500000 },
    { journalEntryId: je2.id, accountId: a["2100"].id, debitCents: 0, creditCents: 41250 },
  ]);

  const [je3] = await db.insert(schema.journalEntries).values({
    organizationId: org.id, date: d(-60), memo: "INV-002 issued", sourceType: "INVOICE", sourceId: inv2.id,
  }).returning();
  await db.insert(schema.journalLines).values([
    { journalEntryId: je3.id, accountId: a["1100"].id, debitCents: 240000, creditCents: 0 },
    { journalEntryId: je3.id, accountId: a["4100"].id, debitCents: 0, creditCents: 240000 },
  ]);

  const [je4] = await db.insert(schema.journalEntries).values({
    organizationId: org.id, date: d(-10), memo: "Payment on INV-002", sourceType: "PAYMENT", sourceId: pmt1.id,
  }).returning();
  await db.insert(schema.journalLines).values([
    { journalEntryId: je4.id, accountId: a["1010"].id, debitCents: 120000, creditCents: 0 },
    { journalEntryId: je4.id, accountId: a["1100"].id, debitCents: 0, creditCents: 120000 },
  ]);

  const [je5] = await db.insert(schema.journalEntries).values({
    organizationId: org.id, date: d(-5), memo: "AWS bill", sourceType: "BILL", sourceId: bill1.id,
  }).returning();
  await db.insert(schema.journalLines).values([
    { journalEntryId: je5.id, accountId: a["5500"].id, debitCents: 328400, creditCents: 0 },
    { journalEntryId: je5.id, accountId: a["2010"].id, debitCents: 0, creditCents: 328400 },
  ]);

  const [je6] = await db.insert(schema.journalEntries).values({
    organizationId: org.id, date: d(-10), memo: "Utilities bill", sourceType: "BILL", sourceId: bill2.id,
  }).returning();
  await db.insert(schema.journalLines).values([
    { journalEntryId: je6.id, accountId: a["5400"].id, debitCents: 42000, creditCents: 0 },
    { journalEntryId: je6.id, accountId: a["2010"].id, debitCents: 0, creditCents: 42000 },
  ]);

  console.log("  journal entries:", 6);
  console.log("✅ Done!  Login: owner@acme.test / password123");
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
