import { Router } from "express";
import { db, accounts, taxRates, journalLines, bankAccounts } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { postEntry, findSystemAccount } from "../lib/ledger";

const router = Router();

router.use(requireAuth);

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;
const CASH_FLOW_CATEGORIES = ["OPERATING", "INVESTING", "FINANCING", "NONE"] as const;
type AccountType = (typeof ACCOUNT_TYPES)[number];
type CashFlowCategory = (typeof CASH_FLOW_CATEGORIES)[number];

const serialize = (r: typeof accounts.$inferSelect) => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
});

// Drizzle wraps the pg error, so the unique-violation code (23505) can be on the
// error itself or its `cause`. Walk the cause chain to detect it.
function isUniqueViolation(err: any): boolean {
  let e = err;
  while (e) {
    if (e.code === "23505") return true;
    e = e.cause;
  }
  return false;
}

router.get("/accounts", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.organizationId, orgId))
    .orderBy(accounts.sortOrder, accounts.code);
  res.json(rows.map(serialize));
});

router.post("/accounts", async (req, res) => {
  const orgId = req.session.organizationId!;
  const {
    code,
    name,
    type,
    subtype,
    parentId,
    cashFlowCategory,
    sortOrder,
    isActive,
    description,
    openingBalanceCents,
    openingBalanceDate,
  } = req.body;
  if (!code?.trim() || !name?.trim()) {
    res.status(400).json({ error: "Code and name are required" });
    return;
  }
  if (!ACCOUNT_TYPES.includes(type)) {
    res.status(400).json({ error: "Invalid account type" });
    return;
  }
  const cashFlow: CashFlowCategory = CASH_FLOW_CATEGORIES.includes(cashFlowCategory)
    ? cashFlowCategory
    : "NONE";

  try {
    const row = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(accounts)
        .values({
          organizationId: orgId,
          code: code.trim(),
          name: name.trim(),
          type: type as AccountType,
          subtype: subtype?.trim() || "general",
          parentId: parentId || null,
          cashFlowCategory: cashFlow,
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
          isActive: isActive === undefined ? true : !!isActive,
          description: description?.trim() || null,
        })
        .returning();

      // Post opening balance journal entry if provided
      if (
        openingBalanceCents &&
        Number.isFinite(openingBalanceCents) &&
        openingBalanceCents !== 0
      ) {
        const retainedEarnings = await findSystemAccount(orgId, "RETAINED_EARNINGS", tx);
        if (retainedEarnings) {
          const date = openingBalanceDate ? new Date(openingBalanceDate) : new Date();
          const abs = Math.abs(openingBalanceCents);
          // Assets/Expenses: Dr NewAccount / Cr RetainedEarnings
          // Liabilities/Equity/Income: Dr RetainedEarnings / Cr NewAccount
          const isDebitNormal = type === "ASSET" || type === "EXPENSE";
          await postEntry(
            {
              organizationId: orgId,
              date,
              memo: `Opening balance — ${name.trim()}`,
              sourceType: "ADJUSTMENT",
              sourceId: created.id,
              lines: isDebitNormal
                ? [
                    { accountId: created.id, debitCents: abs, creditCents: 0 },
                    { accountId: retainedEarnings.id, debitCents: 0, creditCents: abs },
                  ]
                : [
                    { accountId: retainedEarnings.id, debitCents: abs, creditCents: 0 },
                    { accountId: created.id, debitCents: 0, creditCents: abs },
                  ],
            },
            tx,
          );
        }
      }

      // Auto-register bank/savings/credit_card accounts in the banking table
      // so they appear immediately in the import and banking pages.
      const BANKING_SUBTYPES = ["bank", "savings", "credit_card"];
      if (BANKING_SUBTYPES.includes(created.subtype)) {
        await tx
          .insert(bankAccounts)
          .values({
            organizationId: orgId,
            accountId: created.id,
            institutionName: created.name,
          })
          .onConflictDoNothing();
      }

      return created;
    });

    res.status(201).json(serialize(row));
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: `Account code "${code}" already exists` });
      return;
    }
    throw err;
  }
});

router.patch("/accounts/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [existing] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, req.params.id), eq(accounts.organizationId, orgId)));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const {
    code,
    name,
    type,
    subtype,
    parentId,
    cashFlowCategory,
    sortOrder,
    isActive,
    description,
  } = req.body;
  const updates: Partial<typeof accounts.$inferInsert> = {};
  if (code !== undefined) {
    if (!code?.trim()) {
      res.status(400).json({ error: "Code cannot be empty" });
      return;
    }
    updates.code = code.trim();
  }
  if (name !== undefined) {
    if (!name?.trim()) {
      res.status(400).json({ error: "Name cannot be empty" });
      return;
    }
    updates.name = name.trim();
  }
  if (type !== undefined) {
    if (!ACCOUNT_TYPES.includes(type)) {
      res.status(400).json({ error: "Invalid account type" });
      return;
    }
    // System accounts are wired into ledger posting logic — don't let their type drift.
    if (existing.systemRole && type !== existing.type) {
      res.status(400).json({ error: "Cannot change the type of a system account" });
      return;
    }
    updates.type = type as AccountType;
  }
  if (subtype !== undefined) updates.subtype = subtype?.trim() || "general";
  if (parentId !== undefined) updates.parentId = parentId || null;
  if (description !== undefined) updates.description = description?.trim() || null;
  if (cashFlowCategory !== undefined && CASH_FLOW_CATEGORIES.includes(cashFlowCategory))
    updates.cashFlowCategory = cashFlowCategory;
  if (sortOrder !== undefined && Number.isFinite(sortOrder)) updates.sortOrder = sortOrder;
  if (isActive !== undefined) updates.isActive = !!isActive;

  try {
    const [row] = await db
      .update(accounts)
      .set(updates)
      .where(and(eq(accounts.id, req.params.id), eq(accounts.organizationId, orgId)))
      .returning();
    res.json(serialize(row));
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: `Account code "${code}" already exists` });
      return;
    }
    throw err;
  }
});

router.delete("/accounts/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [existing] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, req.params.id), eq(accounts.organizationId, orgId)));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (existing.systemRole) {
    res.status(400).json({ error: "System accounts cannot be deleted. Deactivate it instead." });
    return;
  }

  // Block deletion of accounts that already carry ledger activity to preserve double-entry history.
  const [used] = await db
    .select({ id: journalLines.id })
    .from(journalLines)
    .where(eq(journalLines.accountId, req.params.id))
    .limit(1);
  if (used) {
    res.status(409).json({
      error: "This account has transactions and cannot be deleted. Deactivate it instead.",
    });
    return;
  }

  // Reparent any children to the deleted account's parent so the tree stays intact.
  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({ parentId: existing.parentId })
      .where(and(eq(accounts.parentId, req.params.id), eq(accounts.organizationId, orgId)));

    await tx
      .delete(accounts)
      .where(and(eq(accounts.id, req.params.id), eq(accounts.organizationId, orgId)));
  });
  res.status(204).send();
});

router.get("/tax-rates", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db
    .select()
    .from(taxRates)
    .where(eq(taxRates.organizationId, orgId))
    .orderBy(taxRates.name);
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

export default router;
