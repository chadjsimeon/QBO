import { Router } from "express";
import { db, payments, paymentAllocations, customers, vendors, invoices, bills, accounts, journalEntries, journalLines } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { postEntry } from "../lib/ledger";

const router = Router();

router.use(requireAuth);

function serialize(p: typeof payments.$inferSelect, customerName?: string | null, vendorName?: string | null) {
  return {
    ...p,
    customerName: customerName ?? null,
    vendorName: vendorName ?? null,
    date: p.date.toISOString(),
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/payments", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db.select({
    payment: payments,
    customerName: customers.name,
    vendorName: vendors.name,
  })
    .from(payments)
    .leftJoin(customers, eq(payments.customerId, customers.id))
    .leftJoin(vendors, eq(payments.vendorId, vendors.id))
    .where(eq(payments.organizationId, orgId))
    .orderBy(payments.date);
  res.json(rows.map(r => serialize(r.payment, r.customerName, r.vendorName)));
});

router.post("/payments", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { direction, customerId, vendorId, amountCents, date, method, memo, allocations } = req.body;

  if (!["RECEIVED", "SENT"].includes(direction)) {
    res.status(400).json({ error: "direction must be RECEIVED or SENT" }); return;
  }
  if (!amountCents || !date) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }

  const [cashAccount] = await db.select().from(accounts)
    .where(and(eq(accounts.organizationId, orgId), eq(accounts.systemRole, "CASH")));
  const [arAccount] = await db.select().from(accounts)
    .where(and(eq(accounts.organizationId, orgId), eq(accounts.systemRole, "AR")));
  const [apAccount] = await db.select().from(accounts)
    .where(and(eq(accounts.organizationId, orgId), eq(accounts.systemRole, "AP")));

  const [payment] = await db.insert(payments).values({
    organizationId: orgId,
    direction,
    customerId: customerId || null,
    vendorId: vendorId || null,
    amountCents,
    date: new Date(date),
    method: method || "BANK_TRANSFER",
    memo: memo || null,
  }).returning();

  const allocs: Array<{ invoiceId?: string; billId?: string; amountCents: number }> =
    Array.isArray(allocations) ? allocations : [];

  if (allocs.length > 0) {
    await db.insert(paymentAllocations).values(
      allocs.map(a => ({
        paymentId: payment.id,
        invoiceId: a.invoiceId || null,
        billId: a.billId || null,
        amountCents: a.amountCents,
      }))
    );

    if (direction === "RECEIVED") {
      for (const a of allocs) {
        if (!a.invoiceId) continue;
        const [inv] = await db.select().from(invoices)
          .where(and(eq(invoices.id, a.invoiceId), eq(invoices.organizationId, orgId)));
        if (!inv) continue;
        const newBalance = Math.max(0, inv.balanceCents - a.amountCents);
        await db.update(invoices).set({
          balanceCents: newBalance,
          status: newBalance <= 0 ? "PAID" : "PARTIAL",
        }).where(eq(invoices.id, a.invoiceId));
      }
    } else {
      for (const a of allocs) {
        if (!a.billId) continue;
        const [bill] = await db.select().from(bills)
          .where(and(eq(bills.id, a.billId), eq(bills.organizationId, orgId)));
        if (!bill) continue;
        const newBalance = Math.max(0, bill.balanceCents - a.amountCents);
        await db.update(bills).set({
          balanceCents: newBalance,
          status: newBalance <= 0 ? "PAID" : "PARTIAL",
        }).where(eq(bills.id, a.billId));
      }
    }
  }

  if (cashAccount) {
    if (direction === "RECEIVED" && arAccount) {
      await postEntry({
        organizationId: orgId,
        date: new Date(date),
        memo: memo || "Payment received",
        sourceType: "PAYMENT",
        sourceId: payment.id,
        lines: [
          { accountId: cashAccount.id, debitCents: amountCents, creditCents: 0 },
          { accountId: arAccount.id, debitCents: 0, creditCents: amountCents },
        ],
      });
    } else if (direction === "SENT" && apAccount) {
      await postEntry({
        organizationId: orgId,
        date: new Date(date),
        memo: memo || "Payment sent",
        sourceType: "PAYMENT",
        sourceId: payment.id,
        lines: [
          { accountId: apAccount.id, debitCents: amountCents, creditCents: 0 },
          { accountId: cashAccount.id, debitCents: 0, creditCents: amountCents },
        ],
      });
    }
  }

  res.status(201).json(serialize(payment));
});

router.get("/payments/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [row] = await db.select({
    payment: payments,
    customerName: customers.name,
    vendorName: vendors.name,
  })
    .from(payments)
    .leftJoin(customers, eq(payments.customerId, customers.id))
    .leftJoin(vendors, eq(payments.vendorId, vendors.id))
    .where(and(eq(payments.id, req.params.id), eq(payments.organizationId, orgId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const allocs = await db.select().from(paymentAllocations)
    .where(eq(paymentAllocations.paymentId, req.params.id));

  res.json({ ...serialize(row.payment, row.customerName, row.vendorName), allocations: allocs });
});

router.delete("/payments/:id", async (req, res) => {
  const orgId = req.session.organizationId!;

  const [row] = await db.select({ payment: payments })
    .from(payments)
    .where(and(eq(payments.id, req.params.id), eq(payments.organizationId, orgId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const allocs = await db.select().from(paymentAllocations)
    .where(eq(paymentAllocations.paymentId, req.params.id));

  const [je] = await db.select().from(journalEntries)
    .where(and(
      eq(journalEntries.organizationId, orgId),
      eq(journalEntries.sourceType, "PAYMENT"),
      eq(journalEntries.sourceId, req.params.id)
    )).limit(1);

  if (je) {
    const jeLines = await db.select().from(journalLines)
      .where(eq(journalLines.journalEntryId, je.id));
    await postEntry({
      organizationId: orgId,
      date: new Date(),
      memo: "Reversal of payment",
      sourceType: "ADJUSTMENT",
      isReversal: true,
      reversedEntryId: je.id,
      lines: jeLines.map(l => ({ accountId: l.accountId, debitCents: l.creditCents, creditCents: l.debitCents })),
    });
  }

  for (const a of allocs) {
    if (a.invoiceId) {
      const [inv] = await db.select().from(invoices)
        .where(and(eq(invoices.id, a.invoiceId), eq(invoices.organizationId, orgId)));
      if (inv) {
        const restored = inv.balanceCents + a.amountCents;
        await db.update(invoices).set({
          balanceCents: restored,
          status: restored >= inv.totalCents ? "SENT" : "PARTIAL",
        }).where(eq(invoices.id, a.invoiceId));
      }
    } else if (a.billId) {
      const [bill] = await db.select().from(bills)
        .where(and(eq(bills.id, a.billId), eq(bills.organizationId, orgId)));
      if (bill) {
        const restored = bill.balanceCents + a.amountCents;
        await db.update(bills).set({
          balanceCents: restored,
          status: restored >= bill.totalCents ? "OPEN" : "PARTIAL",
        }).where(eq(bills.id, a.billId));
      }
    }
  }

  await db.delete(payments)
    .where(and(eq(payments.id, req.params.id), eq(payments.organizationId, orgId)));
  res.status(204).send();
});

router.get("/payments/open-invoices/:customerId", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db.select().from(invoices)
    .where(and(eq(invoices.organizationId, orgId), eq(invoices.customerId, req.params.customerId)));
  const open = rows.filter(i => ["SENT", "PARTIAL", "OVERDUE"].includes(i.status) && i.balanceCents > 0);
  res.json(open.map(i => ({ ...i, issueDate: i.issueDate.toISOString(), dueDate: i.dueDate.toISOString(), createdAt: i.createdAt.toISOString() })));
});

router.get("/payments/open-bills/:vendorId", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db.select().from(bills)
    .where(and(eq(bills.organizationId, orgId), eq(bills.vendorId, req.params.vendorId)));
  const open = rows.filter(b => ["OPEN", "PARTIAL", "OVERDUE"].includes(b.status) && b.balanceCents > 0);
  res.json(open.map(b => ({ ...b, issueDate: b.issueDate.toISOString(), dueDate: b.dueDate.toISOString(), createdAt: b.createdAt.toISOString() })));
});

export default router;
