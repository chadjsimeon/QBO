import { Router } from "express";
import { db, customers } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateCustomerBody, UpdateCustomerBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/session";
import { validateBody } from "../lib/validate";

const router = Router();

router.use(requireAuth);

router.get("/customers", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.organizationId, orgId))
    .orderBy(customers.name);
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/customers", validateBody(CreateCustomerBody), async (req, res) => {
  const orgId = req.session.organizationId!;
  const { name, email, phone, billingAddress } = req.body;
  if (!name.trim()) {
    res.status(400).json({ error: "Name required" });
    return;
  }
  const [row] = await db
    .insert(customers)
    .values({
      organizationId: orgId,
      name: name.trim(),
      email: email || null,
      phone: phone || null,
      billingAddress: billingAddress || null,
    })
    .returning();
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.get("/customers/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [row] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, req.params.id), eq(customers.organizationId, orgId)));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.patch("/customers/:id", validateBody(UpdateCustomerBody), async (req, res) => {
  const orgId = req.session.organizationId!;
  const { name, email, phone, billingAddress } = req.body;
  const [row] = await db
    .update(customers)
    .set({
      name,
      email: email || null,
      phone: phone || null,
      billingAddress: billingAddress || null,
    })
    .where(and(eq(customers.id, req.params.id), eq(customers.organizationId, orgId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/customers/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  await db
    .delete(customers)
    .where(and(eq(customers.id, req.params.id), eq(customers.organizationId, orgId)));
  res.status(204).send();
});

export default router;
