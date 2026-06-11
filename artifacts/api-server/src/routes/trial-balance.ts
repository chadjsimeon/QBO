import { Router } from "express";
import { db, accounts, trialBalanceImports } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { getNetDebitByAccount } from "../lib/ledger";

const router = Router();
router.use(requireAuth);

// Trial balance as of a date: each account's balance shown on its natural side.
// Because the ledger is double-entry, Σ(debit) == Σ(credit) by construction.
router.get("/trial-balance", async (req, res) => {
  const orgId = req.session.organizationId!;
  const q = req.query as Record<string, string>;
  const asOf = q.asOf ? new Date(q.asOf + "T23:59:59.999Z") : new Date();
  const includeZero = q.includeZero === "1" || q.includeZero === "true";

  const [accts, net] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.organizationId, orgId)),
    getNetDebitByAccount(orgId, { lte: asOf }),
  ]);

  const all = accts
    .map((a) => {
      const nd = net.get(a.id) ?? 0;
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        isActive: a.isActive,
        debitCents: nd > 0 ? nd : 0,
        creditCents: nd < 0 ? -nd : 0,
      };
    })
    .sort((x, y) => x.code.localeCompare(y.code));

  const rows = includeZero ? all : all.filter((r) => r.debitCents !== 0 || r.creditCents !== 0);
  const totalDebitsCents = rows.reduce((s, r) => s + r.debitCents, 0);
  const totalCreditsCents = rows.reduce((s, r) => s + r.creditCents, 0);
  const differenceCents = totalDebitsCents - totalCreditsCents;

  // If somehow out of balance (data integrity issue), surface the largest balances
  // as adjustment candidates.
  const suspects =
    differenceCents !== 0
      ? [...rows]
          .sort(
            (a, b) =>
              Math.abs(b.debitCents - b.creditCents) - Math.abs(a.debitCents - a.creditCents),
          )
          .slice(0, 5)
          .map((r) => ({ code: r.code, name: r.name }))
      : [];

  res.json({
    asOf: asOf.toISOString(),
    rows,
    totalDebitsCents,
    totalCreditsCents,
    balanced: differenceCents === 0,
    differenceCents,
    suspects,
  });
});

// History of trial balance imports for this company.
router.get("/trial-balance/imports", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db
    .select()
    .from(trialBalanceImports)
    .where(eq(trialBalanceImports.organizationId, orgId))
    .orderBy(desc(trialBalanceImports.createdAt));
  res.json(
    rows.map((r) => ({
      ...r,
      effectiveDate: r.effectiveDate.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

export default router;
