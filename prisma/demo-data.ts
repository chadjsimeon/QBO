/**
 * Demo transactions for the seeded "Acme Demo Co." org. Issues a few invoices
 * and bills and records a customer payment — all through the ledger engine —
 * so reports and the dashboard have real, balanced data to show.
 *
 * Run AFTER `npm run db:seed`:  npx tsx prisma/demo-data.ts
 * Idempotent-ish: it clears prior demo ledger/documents for the org first.
 */

import { PrismaClient } from "@prisma/client";
import {
  postInvoiceIssued,
  postBillEntered,
  postPaymentReceived,
  trialBalance,
} from "../src/lib/ledger";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst({ where: { name: "Acme Demo Co." } });
  if (!org) throw new Error("Seed first: run `npm run db:seed`.");
  const orgId = org.id;

  // Clear prior documents + ledger for a clean demo (keep accounts/contacts).
  await prisma.journalEntry.deleteMany({ where: { organizationId: orgId } });
  await prisma.payment.deleteMany({ where: { organizationId: orgId } });
  await prisma.invoice.deleteMany({ where: { organizationId: orgId } });
  await prisma.bill.deleteMany({ where: { organizationId: orgId } });

  const customer = await prisma.customer.findFirstOrThrow({ where: { organizationId: orgId } });
  const vendor = await prisma.vendor.findFirstOrThrow({ where: { organizationId: orgId } });
  const tax = await prisma.taxRate.findFirstOrThrow({ where: { organizationId: orgId } });

  const acct = (code: string) =>
    prisma.account.findFirstOrThrow({ where: { organizationId: orgId, code } });
  const sales = await acct("4000"); // Sales Revenue
  const service = await acct("4100"); // Service Revenue
  const rent = await acct("6400"); // Rent
  const software = await acct("6500"); // Software & Subscriptions

  const d = (s: string) => new Date(s);

  // ── Invoice 1: issued, taxed, fully open ────────────────────────────────
  const inv1 = await prisma.invoice.create({
    data: {
      organizationId: orgId,
      customerId: customer.id,
      number: "INV-0001",
      status: "DRAFT",
      issueDate: d("2026-01-15"),
      dueDate: d("2026-02-14"),
      subtotalCents: 250000,
      taxCents: Math.round((250000 * tax.rateBps) / 10000),
      totalCents: 250000 + Math.round((250000 * tax.rateBps) / 10000),
      balanceCents: 250000 + Math.round((250000 * tax.rateBps) / 10000),
      lineItems: {
        create: [
          { description: "Consulting services", quantity: 1, unitPriceCents: 250000, accountId: service.id, taxRateId: tax.id, amountCents: 250000, sortOrder: 0 },
        ],
      },
    },
  });
  await issueDoc("invoice", inv1.id);

  // ── Invoice 2: issued, no tax ───────────────────────────────────────────
  const inv2 = await prisma.invoice.create({
    data: {
      organizationId: orgId,
      customerId: customer.id,
      number: "INV-0002",
      status: "DRAFT",
      issueDate: d("2026-02-03"),
      dueDate: d("2026-03-05"),
      subtotalCents: 120000,
      taxCents: 0,
      totalCents: 120000,
      balanceCents: 120000,
      lineItems: {
        create: [
          { description: "Product sale", quantity: 4, unitPriceCents: 30000, accountId: sales.id, amountCents: 120000, sortOrder: 0 },
        ],
      },
    },
  });
  await issueDoc("invoice", inv2.id);

  // ── Bills: rent + software, entered ─────────────────────────────────────
  const bill1 = await prisma.bill.create({
    data: {
      organizationId: orgId,
      vendorId: vendor.id,
      number: "BILL-0001",
      status: "DRAFT",
      issueDate: d("2026-01-31"),
      dueDate: d("2026-02-15"),
      subtotalCents: 180000,
      taxCents: 0,
      totalCents: 180000,
      balanceCents: 180000,
      lineItems: { create: [{ description: "Office rent — January", quantity: 1, unitPriceCents: 180000, accountId: rent.id, amountCents: 180000, sortOrder: 0 }] },
    },
  });
  await issueDoc("bill", bill1.id);

  const bill2 = await prisma.bill.create({
    data: {
      organizationId: orgId,
      vendorId: vendor.id,
      number: "BILL-0002",
      status: "DRAFT",
      issueDate: d("2026-02-01"),
      dueDate: d("2026-02-28"),
      subtotalCents: 4900,
      taxCents: 0,
      totalCents: 4900,
      balanceCents: 4900,
      lineItems: { create: [{ description: "SaaS subscription", quantity: 1, unitPriceCents: 4900, accountId: software.id, amountCents: 4900, sortOrder: 0 }] },
    },
  });
  await issueDoc("bill", bill2.id);

  // ── Payment received against INV-0001 (partial) ─────────────────────────
  const payAmount = 100000;
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        organizationId: orgId,
        direction: "RECEIVED",
        customerId: customer.id,
        amountCents: payAmount,
        date: d("2026-02-20"),
        method: "BANK_TRANSFER",
        allocations: { create: [{ invoiceId: inv1.id, amountCents: payAmount }] },
      },
    });
    await postPaymentReceived(tx, {
      organizationId: orgId,
      paymentId: payment.id,
      date: payment.date,
      amountCents: payAmount,
    });
    const fresh = await tx.invoice.findUniqueOrThrow({ where: { id: inv1.id } });
    const newBalance = fresh.balanceCents - payAmount;
    await tx.invoice.update({
      where: { id: inv1.id },
      data: { balanceCents: newBalance, status: newBalance <= 0 ? "PAID" : "PARTIAL" },
    });
  });

  const tb = await trialBalance(orgId);
  console.log(
    `Demo data posted. Trial balance: debits=${tb.totalDebitCents} credits=${tb.totalCreditCents} balanced=${tb.balanced}`
  );
  if (!tb.balanced) throw new Error("Trial balance does not balance!");

  // Helper: issue an already-created draft document (mirrors the app actions).
  async function issueDoc(kind: "invoice" | "bill", id: string) {
    if (kind === "invoice") {
      const inv = await prisma.invoice.findUniqueOrThrow({ where: { id }, include: { lineItems: true } });
      const byAcct = groupByAccount(inv.lineItems);
      await prisma.$transaction(async (tx) => {
        await postInvoiceIssued(tx, {
          organizationId: orgId,
          invoiceId: inv.id,
          date: inv.issueDate,
          number: inv.number,
          totalCents: inv.totalCents,
          taxCents: inv.taxCents,
          incomeLines: byAcct,
        });
        await tx.invoice.update({ where: { id }, data: { status: "SENT" } });
      });
    } else {
      const bill = await prisma.bill.findUniqueOrThrow({ where: { id }, include: { lineItems: true } });
      const byAcct = groupByAccount(bill.lineItems);
      await prisma.$transaction(async (tx) => {
        await postBillEntered(tx, {
          organizationId: orgId,
          billId: bill.id,
          date: bill.issueDate,
          number: bill.number,
          totalCents: bill.totalCents,
          taxCents: bill.taxCents,
          expenseLines: byAcct,
        });
        await tx.bill.update({ where: { id }, data: { status: "OPEN" } });
      });
    }
  }
}

function groupByAccount(lines: { accountId: string; amountCents: number }[]) {
  const map = new Map<string, number>();
  for (const l of lines) map.set(l.accountId, (map.get(l.accountId) ?? 0) + l.amountCents);
  return [...map.entries()].map(([accountId, amountCents]) => ({ accountId, amountCents }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
