import { Router } from "express";
import { db, invoices, bills, customers, vendors, journalEntries, accounts } from "@workspace/db";
import { eq, inArray, and, or, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { getNetDebitByAccount } from "../lib/ledger";

const router = Router();

router.use(requireAuth);

router.get("/dashboard/summary", async (req, res) => {
  const orgId = req.session.organizationId!;

  const [arResult, apResult, cashAccounts, recentEntries] = await Promise.all([
    db.select({ total: sql<number>`SUM(balance_cents)`.as("total") })
      .from(invoices)
      .where(and(
        eq(invoices.organizationId, orgId),
        inArray(invoices.status, ["SENT", "PARTIAL", "OVERDUE"] as const)
      )),
    db.select({ total: sql<number>`SUM(balance_cents)`.as("total") })
      .from(bills)
      .where(and(
        eq(bills.organizationId, orgId),
        inArray(bills.status, ["OPEN", "PARTIAL", "OVERDUE"] as const)
      )),
    db.select().from(accounts).where(
      and(eq(accounts.organizationId, orgId), eq(accounts.systemRole, "CASH"))
    ),
    db.select().from(journalEntries)
      .where(eq(journalEntries.organizationId, orgId))
      .orderBy(journalEntries.createdAt)
      .limit(6),
  ]);

  // Compute cash balance from ledger
  let cashCents = 0;
  if (cashAccounts.length > 0) {
    const net = await getNetDebitByAccount(orgId);
    for (const acct of cashAccounts) {
      cashCents += net.get(acct.id) ?? 0;
    }
  }

  res.json({
    arOpenCents: Number(arResult[0]?.total ?? 0),
    apOpenCents: Number(apResult[0]?.total ?? 0),
    cashCents,
    recentEntries: recentEntries.map(e => ({
      id: e.id,
      date: e.date.toISOString(),
      memo: e.memo,
      sourceType: e.sourceType,
    })),
  });
});

router.get("/search", async (req, res) => {
  const orgId = req.session.organizationId!;
  const q = String(req.query.q ?? "").trim();
  if (!q) { res.json({ customers: [], vendors: [], invoices: [], bills: [] }); return; }

  const pattern = `%${q}%`;

  const [customerRows, vendorRows, invoiceRows, billRows] = await Promise.all([
    db.select().from(customers).where(
      and(
        eq(customers.organizationId, orgId),
        or(ilike(customers.name, pattern), ilike(customers.email!, pattern))
      )
    ).limit(8),
    db.select().from(vendors).where(
      and(
        eq(vendors.organizationId, orgId),
        or(ilike(vendors.name, pattern), ilike(vendors.email!, pattern))
      )
    ).limit(8),
    db.select({ inv: invoices, customerName: customers.name })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(
        and(
          eq(invoices.organizationId, orgId),
          or(ilike(invoices.number, pattern), ilike(customers.name, pattern))
        )
      ).limit(8),
    db.select({ bill: bills, vendorName: vendors.name })
      .from(bills)
      .leftJoin(vendors, eq(bills.vendorId, vendors.id))
      .where(
        and(
          eq(bills.organizationId, orgId),
          or(ilike(bills.number, pattern), ilike(vendors.name, pattern))
        )
      ).limit(8),
  ]);

  res.json({
    customers: customerRows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
    vendors: vendorRows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
    invoices: invoiceRows.map(r => ({
      ...r.inv,
      customerName: r.customerName,
      issueDate: r.inv.issueDate.toISOString(),
      dueDate: r.inv.dueDate.toISOString(),
      createdAt: r.inv.createdAt.toISOString(),
    })),
    bills: billRows.map(r => ({
      ...r.bill,
      vendorName: r.vendorName,
      issueDate: r.bill.issueDate.toISOString(),
      dueDate: r.bill.dueDate.toISOString(),
      createdAt: r.bill.createdAt.toISOString(),
    })),
  });
});

export default router;
