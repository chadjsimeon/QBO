import { pgTable, text, timestamp, integer, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { customers } from "./contacts";
import { accounts, taxRates } from "./accounts";

export const invoiceStatusEnum = pgEnum("invoice_status", ["DRAFT", "SENT", "PARTIAL", "PAID", "OVERDUE", "VOID"]);

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  customerId: text("customer_id").notNull().references(() => customers.id),
  number: text("number").notNull(),
  status: invoiceStatusEnum("status").default("DRAFT").notNull(),
  issueDate: timestamp("issue_date").notNull(),
  dueDate: timestamp("due_date").notNull(),
  subtotalCents: integer("subtotal_cents").default(0).notNull(),
  taxCents: integer("tax_cents").default(0).notNull(),
  totalCents: integer("total_cents").default(0).notNull(),
  balanceCents: integer("balance_cents").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("invoices_org_number_idx").on(t.organizationId, t.number),
  index("invoices_org_idx").on(t.organizationId),
]);

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  unitPriceCents: integer("unit_price_cents").default(0).notNull(),
  taxRateId: text("tax_rate_id").references(() => taxRates.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  amountCents: integer("amount_cents").default(0).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
}, (t) => [
  index("invoice_lines_invoice_idx").on(t.invoiceId),
]);

export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
