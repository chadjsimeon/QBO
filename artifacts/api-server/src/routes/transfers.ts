import { Router } from "express";
import { db, transfers, accounts } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { postEntry } from "../lib/ledger";

const router = Router();
router.use(requireAuth);

router.get("/transfers", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db
    .select()
    .from(transfers)
    .where(eq(transfers.organizationId, orgId))
    .orderBy(desc(transfers.date));
  res.json(
    rows.map((t) => ({ ...t, date: t.date.toISOString(), createdAt: t.createdAt.toISOString() })),
  );
});

// Move money between two of the org's accounts: debit the destination, credit the source.
router.post("/transfers", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { date, fromAccountId, toAccountId, amountCents, memo } = req.body as {
    date?: string;
    fromAccountId?: string;
    toAccountId?: string;
    amountCents?: number;
    memo?: string;
  };
  if (!date || !fromAccountId || !toAccountId || !amountCents) {
    res.status(400).json({ error: "Date, from, to and amount are required." });
    return;
  }
  if (fromAccountId === toAccountId) {
    res.status(400).json({ error: "From and To accounts must be different." });
    return;
  }
  const amt = Math.round(Number(amountCents));
  if (amt <= 0) {
    res.status(400).json({ error: "Amount must be positive." });
    return;
  }

  const accts = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.organizationId, orgId), inArray(accounts.id, [fromAccountId, toAccountId])),
    );
  if (accts.length !== 2) {
    res.status(400).json({ error: "Invalid account selection." });
    return;
  }

  try {
    const t = await db.transaction(async (tx) => {
      const entry = await postEntry(
        {
          organizationId: orgId,
          date: new Date(date),
          memo: memo || "Transfer",
          sourceType: "TRANSFER",
          lines: [
            { accountId: toAccountId, debitCents: amt, creditCents: 0 },
            { accountId: fromAccountId, debitCents: 0, creditCents: amt },
          ],
        },
        tx,
      );
      const [row] = await tx
        .insert(transfers)
        .values({
          organizationId: orgId,
          date: new Date(date),
          fromAccountId,
          toAccountId,
          amountCents: amt,
          memo: memo || null,
          journalEntryId: entry.id,
        })
        .returning();
      return row;
    });
    res
      .status(201)
      .json({ ...t, date: t.date.toISOString(), createdAt: t.createdAt.toISOString() });
  } catch (e: any) {
    res.status(400).json({ error: e.message ?? "Could not record transfer" });
  }
});

export default router;
