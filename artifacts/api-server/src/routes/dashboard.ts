import { Router } from "express";
import { db, invoices, bills, customers, vendors, journalEntries, journalLines, accounts } from "@workspace/db";
import { eq, inArray, and, or, ilike, sql, gte, desc } from "drizzle-orm";
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

router.get("/dashboard/home", async (req, res) => {
  const orgId = req.session.organizationId!;
  const now = new Date();

  // Date ranges
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const priorMonthStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const priorMonthEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [accts, lastMonthNet, priorMonthNet, allTimeNet, cashFlowRows, recentFeed] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.organizationId, orgId)),
    getNetDebitByAccount(orgId, { gte: lastMonthStart, lte: lastMonthEnd }),
    getNetDebitByAccount(orgId, { gte: priorMonthStart, lte: priorMonthEnd }),
    getNetDebitByAccount(orgId),
    // Monthly cash flow: debit = cash in, credit = cash out, for cash accounts
    db.select({
      month: sql<string>`TO_CHAR(DATE_TRUNC('month', ${journalEntries.date}), 'Mon')`.as("month"),
      monthNum: sql<string>`TO_CHAR(DATE_TRUNC('month', ${journalEntries.date}), 'YYYY-MM')`.as("month_num"),
      debitCents: sql<number>`SUM(${journalLines.debitCents})`.as("debit_cents"),
      creditCents: sql<number>`SUM(${journalLines.creditCents})`.as("credit_cents"),
    })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(and(
        eq(journalEntries.organizationId, orgId),
        eq(accounts.systemRole, "CASH"),
        gte(journalEntries.date, twelveMonthsAgo),
      ))
      .groupBy(sql`DATE_TRUNC('month', ${journalEntries.date})`)
      .orderBy(sql`DATE_TRUNC('month', ${journalEntries.date})`),
    db.select().from(journalEntries)
      .where(eq(journalEntries.organizationId, orgId))
      .orderBy(desc(journalEntries.createdAt))
      .limit(6),
  ]);

  // P&L: income accounts negate net debit (credit balance), expense accounts use net debit
  const incomeAccts = accts.filter(a => a.type === "INCOME");
  const expenseAccts = accts.filter(a => a.type === "EXPENSE" && a.subtype !== "header");
  const cashAccts = accts.filter(a => a.systemRole === "CASH");

  function incomeTotal(net: Map<string, number>) {
    return incomeAccts.reduce((s, a) => s - (net.get(a.id) ?? 0), 0);
  }
  function expenseTotal(net: Map<string, number>) {
    return expenseAccts.reduce((s, a) => s + (net.get(a.id) ?? 0), 0);
  }

  const lastIncome = incomeTotal(lastMonthNet);
  const lastExpenses = expenseTotal(lastMonthNet);
  const lastNet = lastIncome - lastExpenses;
  const priorNet = incomeTotal(priorMonthNet) - expenseTotal(priorMonthNet);
  const changePercent = priorNet !== 0 ? Math.round(((lastNet - priorNet) / Math.abs(priorNet)) * 100) : 0;

  const priorExpenses = expenseTotal(priorMonthNet);
  const expenseChangePercent = priorExpenses !== 0 ? Math.round(((lastExpenses - priorExpenses) / Math.abs(priorExpenses)) * 100) : 0;

  // Expense breakdown by top-level account
  const expenseByCategory = expenseAccts
    .map(a => ({ name: a.name, amountCents: Math.max(0, lastMonthNet.get(a.id) ?? 0) }))
    .filter(e => e.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 6);

  // Bank accounts
  const bankAccounts = cashAccts.map(a => ({
    id: a.id,
    name: a.name,
    code: a.code,
    balanceCents: allTimeNet.get(a.id) ?? 0,
  }));

  // AR / AP
  const [arResult, apResult] = await Promise.all([
    db.select({ total: sql<number>`SUM(balance_cents)`.as("total") })
      .from(invoices)
      .where(and(eq(invoices.organizationId, orgId), inArray(invoices.status, ["SENT", "PARTIAL", "OVERDUE"] as const))),
    db.select({ total: sql<number>`SUM(balance_cents)`.as("total") })
      .from(bills)
      .where(and(eq(bills.organizationId, orgId), inArray(bills.status, ["OPEN", "PARTIAL", "OVERDUE"] as const))),
  ]);

  // Fill in any missing months in cash flow with zeroes
  const cashFlowMap = new Map(cashFlowRows.map(r => [r.monthNum, r]));
  const cashFlowFull: Array<{ month: string; inCents: number; outCents: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const row = cashFlowMap.get(key);
    cashFlowFull.push({
      month: d.toLocaleString("en-US", { month: "short" }),
      inCents: Number(row?.debitCents ?? 0),
      outCents: Number(row?.creditCents ?? 0),
    });
  }

  res.json({
    profitLoss: {
      incomeCents: lastIncome,
      expensesCents: lastExpenses,
      netProfitCents: lastNet,
      priorNetProfitCents: priorNet,
      changePercent,
    },
    expenses: {
      totalCents: lastExpenses,
      priorTotalCents: priorExpenses,
      changePercent: expenseChangePercent,
      byCategory: expenseByCategory,
    },
    bankAccounts,
    cashFlow: cashFlowFull,
    arOpenCents: Number(arResult[0]?.total ?? 0),
    apOpenCents: Number(apResult[0]?.total ?? 0),
    recentFeed: recentFeed.map(e => ({
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
