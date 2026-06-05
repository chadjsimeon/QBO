import { Router } from "express";
import { db, customers, invoices, payments, creditNotes } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/session";

const router = Router();
router.use(requireAuth);

interface Entry { date: string; type: string; ref: string; chargeCents: number; creditCents: number; amountCents: number; }

// Open-item customer statement: invoices are charges (+AR), payments received
// and credit notes are credits (−AR). Running balance shows what the customer
// owes over time.
router.get("/statements/customer/:id", async (req, res) => {
  const orgId = req.session.organizationId!;
  const [customer] = await db.select().from(customers)
    .where(and(eq(customers.id, req.params.id), eq(customers.organizationId, orgId)));
  if (!customer) { res.status(404).json({ error: "Not found" }); return; }

  const now = new Date();
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(now.getFullYear(), 0, 1);
  const to = req.query.to ? new Date(String(req.query.to)) : now;
  to.setHours(23, 59, 59, 999);

  const invRows = await db.select().from(invoices).where(and(eq(invoices.organizationId, orgId), eq(invoices.customerId, customer.id)));
  const payRows = await db.select().from(payments).where(and(eq(payments.organizationId, orgId), eq(payments.customerId, customer.id), eq(payments.direction, "RECEIVED")));
  const cnRows = await db.select().from(creditNotes).where(and(eq(creditNotes.organizationId, orgId), eq(creditNotes.customerId, customer.id)));

  const all: Array<{ date: Date; type: string; ref: string; charge: number; credit: number }> = [];
  for (const i of invRows) {
    if (i.status === "DRAFT" || i.status === "VOID") continue;
    all.push({ date: i.issueDate, type: "Invoice", ref: i.number, charge: i.totalCents, credit: 0 });
  }
  for (const p of payRows) all.push({ date: p.date, type: "Payment", ref: p.method, charge: 0, credit: p.amountCents });
  for (const c of cnRows) all.push({ date: c.date, type: "Credit note", ref: c.number, charge: 0, credit: c.totalCents });

  all.sort((a, b) => a.date.getTime() - b.date.getTime());

  let opening = 0;
  for (const e of all) if (e.date < from) opening += e.charge - e.credit;

  let running = opening;
  const entries: Entry[] = [];
  for (const e of all) {
    if (e.date < from || e.date > to) continue;
    const amount = e.charge - e.credit;
    running += amount;
    entries.push({ date: e.date.toISOString(), type: e.type, ref: e.ref, chargeCents: e.charge, creditCents: e.credit, amountCents: running });
  }

  res.json({
    customer: { id: customer.id, name: customer.name, email: customer.email, billingAddress: customer.billingAddress },
    from: from.toISOString(),
    to: to.toISOString(),
    openingBalanceCents: opening,
    closingBalanceCents: running,
    entries,
  });
});

export default router;
