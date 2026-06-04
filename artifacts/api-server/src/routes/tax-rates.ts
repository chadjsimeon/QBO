import { Router } from "express";
import { db, taxRates } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/session";

const router = Router();

router.use(requireAuth);

router.get("/tax-rates", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db.select().from(taxRates).where(eq(taxRates.organizationId, orgId));
  res.json(rows);
});

export default router;
