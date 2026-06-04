import { Router } from "express";
import { db, payments, paymentAllocations, customers, vendors } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/session";

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
  if (!["RECEIVED","SENT"].includes(direction)) {
    res.status(400).json({ error: "direction must be RECEIVED or SENT" }); return;
  }
  if (!amountCents || !date) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }

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

  if (allocations?.length) {
    await db.insert(paymentAllocations).values(
      allocations.map((a: { invoiceId?: string; billId?: string; amountCents: number }) => ({
        paymentId: payment.id,
        invoiceId: a.invoiceId || null,
        billId: a.billId || null,
        amountCents: a.amountCents,
      }))
    );
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
  res.json(serialize(row.payment, row.customerName, row.vendorName));
});

router.delete("/payments/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  await db.delete(payments)
    .where(and(eq(payments.id, req.params.id), eq(payments.organizationId, orgId)));
  res.status(204).send();
});

export default router;
