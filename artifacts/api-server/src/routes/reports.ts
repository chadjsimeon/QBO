import { Router } from "express";
import { db, accounts, invoices, bills, customers, vendors } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/session";
import { getNetDebitByAccount } from "../lib/ledger";

const router = Router();

router.use(requireAuth);

interface AccountRow {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
  sortOrder: number;
  systemRole: string | null;
}

interface AccountNode extends AccountRow {
  children: AccountNode[];
  depth: number;
}

function buildTree(accts: AccountRow[]): AccountNode[] {
  const byId = new Map<string, AccountNode>();
  for (const a of accts) byId.set(a.id, { ...a, children: [], depth: 0 });
  const roots: AccountNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  const sort = (nodes: AccountNode[], depth: number) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
    for (const n of nodes) { n.depth = depth; sort(n.children, depth + 1); }
  };
  sort(roots, 0);
  return roots;
}

function displayAmt(type: string, netDebit: number) {
  return type === "INCOME" || type === "LIABILITY" || type === "EQUITY" ? -netDebit : netDebit;
}

function buildSection(type: string, tree: AccountNode[], net: Map<string, number>, nonZero: boolean) {
  const rows: Array<{ id: string; code: string; name: string; amountCents: number; depth: number; isSubtotal?: boolean }> = [];

  function subtotalOf(node: AccountNode): number {
    const own = displayAmt(type, net.get(node.id) ?? 0);
    const childTotal = node.children.reduce((s, c) => s + subtotalOf(c), 0);
    return own + childTotal;
  }

  function walk(nodes: AccountNode[]) {
    for (const n of nodes) {
      if (n.type !== type) continue;
      const total = subtotalOf(n);
      if (nonZero && total === 0) continue;

      rows.push({ id: n.id, code: n.code, name: n.name, amountCents: total, depth: n.depth });

      if (n.children.length > 0) {
        walk(n.children);
        rows.push({ id: `sub-${n.id}`, code: "", name: `Total ${n.name}`, amountCents: total, depth: n.depth, isSubtotal: true });
      }
    }
  }

  walk(tree);
  const total = tree.filter(n => n.type === type).reduce((s, n) => s + subtotalOf(n), 0);
  return { label: type, rows, total };
}

router.get("/reports/profit-loss", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { start, end, nonzero } = req.query as Record<string, string>;

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (start) dateFilter.gte = new Date(start);
  if (end) dateFilter.lte = new Date(end);

  const [accts, net] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.organizationId, orgId)),
    getNetDebitByAccount(orgId, dateFilter),
  ]);

  const tree = buildTree(accts);
  const nonZero = nonzero === "1" || nonzero === "true";
  const income = buildSection("INCOME", tree, net, nonZero);
  const expenses = buildSection("EXPENSE", tree, net, nonZero);

  res.json({
    income,
    expenses,
    netIncomeCents: income.total - expenses.total,
    start: start ?? null,
    end: end ?? null,
  });
});

router.get("/reports/balance-sheet", async (req, res) => {
  const orgId = req.session.organizationId!;
  const { asOf } = req.query as Record<string, string>;
  const asOfDate = asOf ? new Date(asOf) : new Date();

  const [accts, net] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.organizationId, orgId)),
    getNetDebitByAccount(orgId, { lte: asOfDate }),
  ]);

  const tree = buildTree(accts);
  const assets = buildSection("ASSET", tree, net, false);
  const liabilities = buildSection("LIABILITY", tree, net, false);
  const equity = buildSection("EQUITY", tree, net, false);

  res.json({
    assets,
    liabilities,
    equity,
    asOf: asOfDate.toISOString(),
  });
});

router.get("/reports/ar-aging", async (req, res) => {
  const orgId = req.session.organizationId!;
  const asOf = new Date();

  const openInvoices = await db.select({ inv: invoices, customerName: customers.name })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(eq(invoices.organizationId, orgId));

  const eligible = openInvoices.filter(r =>
    ["SENT", "PARTIAL", "OVERDUE"].includes(r.inv.status) && r.inv.balanceCents > 0
  );

  const rows = eligible.map(r => {
    const overdue = Math.floor((asOf.getTime() - r.inv.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    return {
      id: r.inv.id,
      name: r.customerName || "",
      totalCents: r.inv.balanceCents,
      current: overdue <= 0 ? r.inv.balanceCents : 0,
      days30: overdue > 0 && overdue <= 30 ? r.inv.balanceCents : 0,
      days60: overdue > 30 && overdue <= 60 ? r.inv.balanceCents : 0,
      days90: overdue > 60 && overdue <= 90 ? r.inv.balanceCents : 0,
      over90: overdue > 90 ? r.inv.balanceCents : 0,
    };
  });

  const totals = rows.reduce((acc, r) => ({
    id: "totals", name: "Total",
    totalCents: acc.totalCents + r.totalCents,
    current: acc.current + r.current,
    days30: acc.days30 + r.days30,
    days60: acc.days60 + r.days60,
    days90: acc.days90 + r.days90,
    over90: acc.over90 + r.over90,
  }), { id: "totals", name: "Total", totalCents: 0, current: 0, days30: 0, days60: 0, days90: 0, over90: 0 });

  res.json({ rows, totals });
});

router.get("/reports/ap-aging", async (req, res) => {
  const orgId = req.session.organizationId!;
  const asOf = new Date();

  const openBills = await db.select({ bill: bills, vendorName: vendors.name })
    .from(bills)
    .leftJoin(vendors, eq(bills.vendorId, vendors.id))
    .where(eq(bills.organizationId, orgId));

  const eligible = openBills.filter(r =>
    ["OPEN", "PARTIAL", "OVERDUE"].includes(r.bill.status) && r.bill.balanceCents > 0
  );

  const rows = eligible.map(r => {
    const overdue = Math.floor((asOf.getTime() - r.bill.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    return {
      id: r.bill.id,
      name: r.vendorName || "",
      totalCents: r.bill.balanceCents,
      current: overdue <= 0 ? r.bill.balanceCents : 0,
      days30: overdue > 0 && overdue <= 30 ? r.bill.balanceCents : 0,
      days60: overdue > 30 && overdue <= 60 ? r.bill.balanceCents : 0,
      days90: overdue > 60 && overdue <= 90 ? r.bill.balanceCents : 0,
      over90: overdue > 90 ? r.bill.balanceCents : 0,
    };
  });

  const totals = rows.reduce((acc, r) => ({
    id: "totals", name: "Total",
    totalCents: acc.totalCents + r.totalCents,
    current: acc.current + r.current,
    days30: acc.days30 + r.days30,
    days60: acc.days60 + r.days60,
    days90: acc.days90 + r.days90,
    over90: acc.over90 + r.over90,
  }), { id: "totals", name: "Total", totalCents: 0, current: 0, days30: 0, days60: 0, days90: 0, over90: 0 });

  res.json({ rows, totals });
});

export default router;
