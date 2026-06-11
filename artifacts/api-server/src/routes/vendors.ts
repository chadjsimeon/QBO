import { Router } from "express";
import { db, vendors } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateVendorBody, UpdateVendorBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/session";
import { validateBody } from "../lib/validate";

const router = Router();

router.use(requireAuth);

router.get("/vendors", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db
    .select()
    .from(vendors)
    .where(eq(vendors.organizationId, orgId))
    .orderBy(vendors.name);
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/vendors", validateBody(CreateVendorBody), async (req, res) => {
  const orgId = req.session.organizationId!;
  const { name, email, phone, address } = req.body;
  if (!name.trim()) {
    res.status(400).json({ error: "Name required" });
    return;
  }
  const [row] = await db
    .insert(vendors)
    .values({
      organizationId: orgId,
      name: name.trim(),
      email: email || null,
      phone: phone || null,
      address: address || null,
    })
    .returning();
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.get("/vendors/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [row] = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, req.params.id), eq(vendors.organizationId, orgId)));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.patch("/vendors/:id", validateBody(UpdateVendorBody), async (req, res) => {
  const orgId = req.session.organizationId!;
  const { name, email, phone, address } = req.body;
  const [row] = await db
    .update(vendors)
    .set({ name, email: email || null, phone: phone || null, address: address || null })
    .where(and(eq(vendors.id, req.params.id), eq(vendors.organizationId, orgId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/vendors/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  await db
    .delete(vendors)
    .where(and(eq(vendors.id, req.params.id), eq(vendors.organizationId, orgId)));
  res.status(204).send();
});

export default router;
