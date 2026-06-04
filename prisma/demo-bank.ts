/**
 * Demo banking data for "Acme Demo Co." — a connected bank account on the
 * Operating Account plus a batch of sample "For review" transactions. Some
 * match the existing demo payment (run prisma/demo-data.ts first); others are
 * fresh deposits/expenses to categorize, and one internal transfer to exclude.
 *
 * Run AFTER seed + demo-data:  npx tsx prisma/demo-bank.ts
 * Idempotent: clears the org's bank accounts/transactions first.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst({ where: { name: "Acme Demo Co." } });
  if (!org) throw new Error("Seed first: run `npm run db:seed`.");
  const orgId = org.id;

  // The GL account this feed maps to: the Operating Account (systemRole CASH).
  const gl = await prisma.account.findFirstOrThrow({
    where: { organizationId: orgId, systemRole: "CASH" },
  });

  // Clean prior demo banking data (transactions cascade with the account).
  await prisma.bankTransaction.deleteMany({ where: { organizationId: orgId } });
  await prisma.reconciliation.deleteMany({ where: { organizationId: orgId } });
  await prisma.bankAccount.deleteMany({ where: { organizationId: orgId } });

  const bank = await prisma.bankAccount.create({
    data: {
      organizationId: orgId,
      accountId: gl.id,
      institutionName: "First Demo Bank",
      accountMask: "4291",
      bankBalanceCents: 200000, // statement balance the widget shows vs book
      bankBalanceAsOf: new Date("2026-02-28"),
    },
  });

  const d = (s: string) => new Date(s);
  // amountCents: + = money in, - = money out
  const txns: { date: string; descriptionRaw: string; amountCents: number }[] = [
    { date: "2026-02-20", descriptionRaw: "ACH DEPOSIT GLOBEX CORP", amountCents: 100000 }, // matches demo payment
    { date: "2026-02-05", descriptionRaw: "DEPOSIT - CUSTOMER PAYMENT", amountCents: 45000 },
    { date: "2026-02-25", descriptionRaw: "STRIPE PAYOUT", amountCents: 30000 },
    { date: "2026-02-10", descriptionRaw: "SAAS SUBSCRIPTION ACME", amountCents: -4900 },
    { date: "2026-02-12", descriptionRaw: "CITY UTILITIES AUTOPAY", amountCents: -12000 },
    { date: "2026-02-15", descriptionRaw: "MONTHLY BANK SERVICE FEE", amountCents: -1500 },
    { date: "2026-02-18", descriptionRaw: "OFFICE DEPOT #1182", amountCents: -8000 },
    { date: "2026-02-22", descriptionRaw: "TRANSFER TO SAVINGS", amountCents: -50000 }, // exclude
  ];

  await prisma.bankTransaction.createMany({
    data: txns.map((t) => ({
      organizationId: orgId,
      bankAccountId: bank.id,
      date: d(t.date),
      descriptionRaw: t.descriptionRaw,
      amountCents: t.amountCents,
    })),
  });

  console.log(
    `Connected "${bank.institutionName} ••${bank.accountMask}" to GL ${gl.code} ${gl.name}; ` +
      `imported ${txns.length} transactions (FOR_REVIEW).`
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
