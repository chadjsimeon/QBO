import { Router } from "express";
import { db, invoices, invoiceLineItems, customers, taxRates, journalEntries, journalLines, accounts } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { CreateInvoiceBody, UpdateInvoiceBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/session";
import { findSystemAccount, postEntry } from "../lib/ledger";
import { validateBody } from "../lib/validate";

const router = Router();

router.use(requireAuth);

function computeLines(lines: Array<{ description: string; quantity: number; unitPriceCents: number; accountId: string; taxRateId?: string | null }>, taxMap: Map<string, number>) {
  return lines.map(l => {
    const amt = l.quantity * l.unitPriceCents;
    const rateBps = l.taxRateId ? (taxMap.get(l.taxRateId) ?? 0) : 0;
    const tax = l.taxRateId ? Math.round(amt * rateBps / 10000) : 0;
    return { ...l, amountCents: amt, taxCents: tax };
  });
}

async function getTaxMap(orgId: string) {
  const rates = await db.select().from(taxRates).where(eq(taxRates.organizationId, orgId));
  return new Map(rates.map(r => [r.id, r.rateBps]));
}

function serializeInvoice(inv: typeof invoices.$inferSelect, customerName?: string | null) {
  return {
    ...inv,
    customerName: customerName ?? null,
    issueDate: inv.issueDate.toISOString(),
    dueDate: inv.dueDate.toISOString(),
    createdAt: inv.createdAt.toISOString(),
  };
}

router.get("/invoices", async (req, res) => {
  const orgId = req.session.organizationId!;
  const rows = await db.select({
    inv: invoices,
    customerName: customers.name,
  })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(eq(invoices.organizationId, orgId))
    .orderBy(invoices.issueDate);
  res.json(rows.map(r => serializeInvoice(r.inv, r.customerName)));
});

router.post("/invoices", validateBody(CreateInvoiceBody), async (req, res) => {
  const orgId = req.session.organizationId!;
  const { contactId, number, issueDate, dueDate, lines } = req.body;
  if (!contactId || !number || !issueDate || !dueDate || !lines?.length) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }

  const taxMap = await getTaxMap(orgId);
  const computed = computeLines(lines, taxMap);
  const subtotalCents = computed.reduce((s, l) => s + l.amountCents, 0);
  const taxCents = computed.reduce((s, l) => s + l.taxCents, 0);
  const totalCents = subtotalCents + taxCents;

  const inv = await db.transaction(async (tx) => {
    const [row] = await tx.insert(invoices).values({
      organizationId: orgId,
      customerId: contactId,
      number,
      status: "DRAFT",
      issueDate: new Date(issueDate),
      dueDate: new Date(dueDate),
      subtotalCents,
      taxCents,
      totalCents,
      balanceCents: totalCents,
    }).returning();

    await tx.insert(invoiceLineItems).values(computed.map((l, i) => ({
      invoiceId: row.id,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      taxRateId: l.taxRateId || null,
      accountId: l.accountId,
      amountCents: l.amountCents,
      sortOrder: i,
    })));
    return row;
  });

  res.status(201).json(serializeInvoice(inv));
});

router.get("/invoices/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [row] = await db.select({ inv: invoices, customerName: customers.name })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(and(eq(invoices.id, req.params.id), eq(invoices.organizationId, orgId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const lines = await db.select().from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, req.params.id))
    .orderBy(invoiceLineItems.sortOrder);

  res.json({ ...serializeInvoice(row.inv, row.customerName), lineItems: lines });
});

router.patch("/invoices/:id", validateBody(UpdateInvoiceBody), async (req, res) => {
  const orgId = req.session.organizationId!;
  const { contactId, number, issueDate, dueDate, lines } = req.body;

  const [existing] = await db.select().from(invoices)
    .where(and(eq(invoices.id, req.params.id), eq(invoices.organizationId, orgId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "DRAFT") { res.status(400).json({ error: "Only DRAFT invoices can be edited" }); return; }

  const taxMap = await getTaxMap(orgId);
  const computed = computeLines(lines, taxMap);
  const subtotalCents = computed.reduce((s, l) => s + l.amountCents, 0);
  const taxCents = computed.reduce((s, l) => s + l.taxCents, 0);
  const totalCents = subtotalCents + taxCents;

  const inv = await db.transaction(async (tx) => {
    const [row] = await tx.update(invoices).set({
      customerId: contactId,
      number,
      issueDate: new Date(issueDate),
      dueDate: new Date(dueDate),
      subtotalCents,
      taxCents,
      totalCents,
      balanceCents: totalCents,
    }).where(eq(invoices.id, req.params.id)).returning();

    await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, req.params.id));
    await tx.insert(invoiceLineItems).values(computed.map((l, i) => ({
      invoiceId: row.id,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      taxRateId: l.taxRateId || null,
      accountId: l.accountId,
      amountCents: l.amountCents,
      sortOrder: i,
    })));
    return row;
  });

  res.json(serializeInvoice(inv));
});

router.post("/invoices/:id/issue", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [existing] = await db.select().from(invoices)
    .where(and(eq(invoices.id, req.params.id), eq(invoices.organizationId, orgId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status !== "DRAFT") { res.status(400).json({ error: "Only DRAFT invoices can be issued" }); return; }

  // Find AR account (systemRole = "AR") and first non-header income account
  const [arAccount] = await db.select().from(accounts)
    .where(and(eq(accounts.organizationId, orgId), eq(accounts.systemRole, "AR")));
  const [incomeAccount] = await db.select().from(accounts)
    .where(and(
      eq(accounts.organizationId, orgId),
      eq(accounts.type, "INCOME"),
      // @ts-ignore drizzle typing for ne
      eq(accounts.subtype as any, "revenue")
    ));

  const inv = await db.transaction(async (tx) => {
    if (arAccount && incomeAccount) {
      const entryLines: Array<{ accountId: string; debitCents: number; creditCents: number }> = [
        { accountId: arAccount.id, debitCents: existing.totalCents, creditCents: 0 },
        { accountId: incomeAccount.id, debitCents: 0, creditCents: existing.subtotalCents },
      ];
      if (existing.taxCents > 0) {
        const [taxAccount] = await tx.select().from(accounts)
          .where(and(eq(accounts.organizationId, orgId), eq(accounts.systemRole, "SALES_TAX_PAYABLE")));
        entryLines.push({ accountId: (taxAccount ?? incomeAccount).id, debitCents: 0, creditCents: existing.taxCents });
      }
      await postEntry({
        organizationId: orgId,
        date: existing.issueDate,
        memo: `${existing.number} issued`,
        sourceType: "INVOICE",
        sourceId: existing.id,
        lines: entryLines,
      }, tx);
    }

    const [row] = await tx.update(invoices).set({ status: "SENT" })
      .where(eq(invoices.id, req.params.id)).returning();
    return row;
  });
  res.json(serializeInvoice(inv));
});

router.delete("/invoices/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  await db.delete(invoices)
    .where(and(eq(invoices.id, req.params.id), eq(invoices.organizationId, orgId)));
  res.status(204).send();
});

router.post("/invoices/:id/void", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [existing] = await db.select().from(invoices)
    .where(and(eq(invoices.id, req.params.id), eq(invoices.organizationId, orgId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const inv = await db.transaction(async (tx) => {
    if (existing.status !== "VOID") {
      // Reverse any journal entry
      const [je] = await tx.select().from(journalEntries)
        .where(and(
          eq(journalEntries.organizationId, orgId),
          eq(journalEntries.sourceType, "INVOICE"),
          eq(journalEntries.sourceId, existing.id)
        )).limit(1);

      if (je) {
        const lines = await tx.select().from(journalLines)
          .where(eq(journalLines.journalEntryId, je.id));

        await postEntry({
          organizationId: orgId,
          date: new Date(),
          memo: `Void invoice ${existing.number}`,
          sourceType: "ADJUSTMENT",
          isReversal: true,
          reversedEntryId: je.id,
          lines: lines.map(l => ({
            accountId: l.accountId,
            debitCents: l.creditCents,
            creditCents: l.debitCents,
          })),
        }, tx);
      }
    }

    const [row] = await tx.update(invoices).set({ status: "VOID" })
      .where(eq(invoices.id, req.params.id)).returning();
    return row;
  });
  res.json(serializeInvoice(inv));
});

export default router;
