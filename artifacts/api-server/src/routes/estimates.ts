import { Router } from "express";
import {
  db,
  estimates,
  estimateLineItems,
  customers,
  invoices,
  invoiceLineItems,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { getTaxMap, computeLines, sumTotals } from "../lib/documents";

const router = Router();
router.use(requireAuth);

function serialize(e: typeof estimates.$inferSelect, customerName?: string | null) {
  return {
    ...e,
    customerName: customerName ?? null,
    issueDate: e.issueDate.toISOString(),
    expiryDate: e.expiryDate ? e.expiryDate.toISOString() : null,
    createdAt: e.createdAt.toISOString(),
  };
}

router.get("/estimates", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db
    .select({ e: estimates, customerName: customers.name })
    .from(estimates)
    .leftJoin(customers, eq(estimates.customerId, customers.id))
    .where(eq(estimates.organizationId, orgId))
    .orderBy(desc(estimates.issueDate));
  res.json(rows.map((r) => serialize(r.e, r.customerName)));
});

router.get("/estimates/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [row] = await db
    .select({ e: estimates, customerName: customers.name })
    .from(estimates)
    .leftJoin(customers, eq(estimates.customerId, customers.id))
    .where(and(eq(estimates.id, req.params.id), eq(estimates.organizationId, orgId)));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const lines = await db
    .select()
    .from(estimateLineItems)
    .where(eq(estimateLineItems.estimateId, req.params.id))
    .orderBy(estimateLineItems.sortOrder);
  res.json({ ...serialize(row.e, row.customerName), lineItems: lines });
});

router.post("/estimates", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { customerId, number, issueDate, expiryDate, memo, lines } = req.body;
  if (!customerId || !number || !issueDate || !lines?.length) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const computed = computeLines(lines, await getTaxMap(orgId));
  const { subtotalCents, taxCents, totalCents } = sumTotals(computed);

  const [est] = await db
    .insert(estimates)
    .values({
      organizationId: orgId,
      customerId,
      number,
      status: "DRAFT",
      issueDate: new Date(issueDate),
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      memo: memo || null,
      subtotalCents,
      taxCents,
      totalCents,
    })
    .returning();
  await db.insert(estimateLineItems).values(
    computed.map((l, i) => ({
      estimateId: est.id,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      taxRateId: l.taxRateId || null,
      accountId: l.accountId,
      amountCents: l.amountCents,
      sortOrder: i,
    })),
  );
  res.status(201).json(serialize(est));
});

router.post("/estimates/:id/status", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { status } = req.body;
  if (!["DRAFT", "SENT", "ACCEPTED", "DECLINED"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const [est] = await db
    .update(estimates)
    .set({ status })
    .where(and(eq(estimates.id, req.params.id), eq(estimates.organizationId, orgId)))
    .returning();
  if (!est) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serialize(est));
});

// Convert to a DRAFT invoice (copies the lines). The invoice is issued separately.
router.post("/estimates/:id/convert", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [est] = await db
    .select()
    .from(estimates)
    .where(and(eq(estimates.id, req.params.id), eq(estimates.organizationId, orgId)));
  if (!est) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (est.status === "CONVERTED") {
    res.status(400).json({ error: "Already converted" });
    return;
  }

  const lines = await db
    .select()
    .from(estimateLineItems)
    .where(eq(estimateLineItems.estimateId, est.id))
    .orderBy(estimateLineItems.sortOrder);
  const existing = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.organizationId, orgId));
  const number = `INV-${String(existing.length + 1).padStart(4, "0")}`;
  const now = new Date();
  const due = new Date(now);
  due.setDate(due.getDate() + 30);

  const [inv] = await db
    .insert(invoices)
    .values({
      organizationId: orgId,
      customerId: est.customerId,
      number,
      status: "DRAFT",
      issueDate: now,
      dueDate: due,
      subtotalCents: est.subtotalCents,
      taxCents: est.taxCents,
      totalCents: est.totalCents,
      balanceCents: est.totalCents,
    })
    .returning();
  await db.insert(invoiceLineItems).values(
    lines.map((l, i) => ({
      invoiceId: inv.id,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      taxRateId: l.taxRateId,
      accountId: l.accountId,
      amountCents: l.amountCents,
      sortOrder: i,
    })),
  );
  await db
    .update(estimates)
    .set({ status: "CONVERTED", convertedInvoiceId: inv.id })
    .where(eq(estimates.id, est.id));
  res.json({ ok: true, invoiceId: inv.id, invoiceNumber: number });
});

router.delete("/estimates/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  await db
    .delete(estimates)
    .where(and(eq(estimates.id, req.params.id), eq(estimates.organizationId, orgId)));
  res.status(204).send();
});

export default router;
