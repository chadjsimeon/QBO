import { Router } from "express";
import { db, accounts, taxRates } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/session";

const router = Router();

router.use(requireAuth);

router.get("/accounts", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db.select().from(accounts)
    .where(eq(accounts.organizationId, orgId))
    .orderBy(accounts.sortOrder, accounts.code);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.get("/tax-rates", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db.select().from(taxRates)
    .where(eq(taxRates.organizationId, orgId))
    .orderBy(taxRates.name);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

export default router;
