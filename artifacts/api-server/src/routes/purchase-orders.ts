import { Router } from "express";
import {
  db,
  purchaseOrders,
  purchaseOrderLineItems,
  vendors,
  bills,
  billLineItems,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { getTaxMap, computeLines, sumTotals } from "../lib/documents";

const router = Router();
router.use(requireAuth);

function serialize(p: typeof purchaseOrders.$inferSelect, vendorName?: string | null) {
  return {
    ...p,
    vendorName: vendorName ?? null,
    issueDate: p.issueDate.toISOString(),
    expectedDate: p.expectedDate ? p.expectedDate.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/purchase-orders", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db
    .select({ p: purchaseOrders, vendorName: vendors.name })
    .from(purchaseOrders)
    .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
    .where(eq(purchaseOrders.organizationId, orgId))
    .orderBy(desc(purchaseOrders.issueDate));
  res.json(rows.map((r) => serialize(r.p, r.vendorName)));
});

router.get("/purchase-orders/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [row] = await db
    .select({ p: purchaseOrders, vendorName: vendors.name })
    .from(purchaseOrders)
    .leftJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
    .where(and(eq(purchaseOrders.id, req.params.id), eq(purchaseOrders.organizationId, orgId)));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const lines = await db
    .select()
    .from(purchaseOrderLineItems)
    .where(eq(purchaseOrderLineItems.purchaseOrderId, req.params.id))
    .orderBy(purchaseOrderLineItems.sortOrder);
  res.json({ ...serialize(row.p, row.vendorName), lineItems: lines });
});

router.post("/purchase-orders", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { vendorId, number, issueDate, expectedDate, memo, lines } = req.body;
  if (!vendorId || !number || !issueDate || !lines?.length) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const computed = computeLines(lines, await getTaxMap(orgId));
  const { subtotalCents, taxCents, totalCents } = sumTotals(computed);

  const [po] = await db
    .insert(purchaseOrders)
    .values({
      organizationId: orgId,
      vendorId,
      number,
      status: "DRAFT",
      issueDate: new Date(issueDate),
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      memo: memo || null,
      subtotalCents,
      taxCents,
      totalCents,
    })
    .returning();
  await db.insert(purchaseOrderLineItems).values(
    computed.map((l, i) => ({
      purchaseOrderId: po.id,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      taxRateId: l.taxRateId || null,
      accountId: l.accountId,
      amountCents: l.amountCents,
      sortOrder: i,
    })),
  );
  res.status(201).json(serialize(po));
});

router.post("/purchase-orders/:id/status", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { status } = req.body;
  if (!["DRAFT", "SENT", "CLOSED"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const [po] = await db
    .update(purchaseOrders)
    .set({ status })
    .where(and(eq(purchaseOrders.id, req.params.id), eq(purchaseOrders.organizationId, orgId)))
    .returning();
  if (!po) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serialize(po));
});

// Convert to a DRAFT bill (copies the lines). The bill is entered separately.
router.post("/purchase-orders/:id/convert", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, req.params.id), eq(purchaseOrders.organizationId, orgId)));
  if (!po) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (po.status === "CONVERTED") {
    res.status(400).json({ error: "Already converted" });
    return;
  }

  const lines = await db
    .select()
    .from(purchaseOrderLineItems)
    .where(eq(purchaseOrderLineItems.purchaseOrderId, po.id))
    .orderBy(purchaseOrderLineItems.sortOrder);
  const existing = await db
    .select({ id: bills.id })
    .from(bills)
    .where(eq(bills.organizationId, orgId));
  const number = `BILL-${String(existing.length + 1).padStart(4, "0")}`;
  const now = new Date();
  const due = new Date(now);
  due.setDate(due.getDate() + 30);

  const [bill] = await db
    .insert(bills)
    .values({
      organizationId: orgId,
      vendorId: po.vendorId,
      number,
      status: "DRAFT",
      issueDate: now,
      dueDate: due,
      subtotalCents: po.subtotalCents,
      taxCents: po.taxCents,
      totalCents: po.totalCents,
      balanceCents: po.totalCents,
    })
    .returning();
  await db.insert(billLineItems).values(
    lines.map((l, i) => ({
      billId: bill.id,
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
    .update(purchaseOrders)
    .set({ status: "CONVERTED", convertedBillId: bill.id })
    .where(eq(purchaseOrders.id, po.id));
  res.json({ ok: true, billId: bill.id, billNumber: number });
});

router.delete("/purchase-orders/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  await db
    .delete(purchaseOrders)
    .where(and(eq(purchaseOrders.id, req.params.id), eq(purchaseOrders.organizationId, orgId)));
  res.status(204).send();
});

export default router;
