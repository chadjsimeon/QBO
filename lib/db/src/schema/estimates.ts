import { pgTable, text, timestamp, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { customers } from "./contacts";
import { accounts, taxRates } from "./accounts";

// A quote/estimate — a non-posting sales document. It can be converted into a
// DRAFT invoice (which is then issued separately to post to the ledger).
export const estimateStatusEnum = pgEnum("estimate_status", ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "CONVERTED"]);

export const estimates = pgTable("estimates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  customerId: text("customer_id").notNull().references(() => customers.id),
  number: text("number").notNull(),
  status: estimateStatusEnum("status").default("DRAFT").notNull(),
  issueDate: timestamp("issue_date").notNull(),
  expiryDate: timestamp("expiry_date"),
  memo: text("memo"),
  subtotalCents: integer("subtotal_cents").default(0).notNull(),
  taxCents: integer("tax_cents").default(0).notNull(),
  totalCents: integer("total_cents").default(0).notNull(),
  convertedInvoiceId: text("converted_invoice_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("estimates_org_idx").on(t.organizationId)]);

export const estimateLineItems = pgTable("estimate_line_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  estimateId: text("estimate_id").notNull().references(() => estimates.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  unitPriceCents: integer("unit_price_cents").default(0).notNull(),
  taxRateId: text("tax_rate_id").references(() => taxRates.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  amountCents: integer("amount_cents").default(0).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
}, (t) => [index("estimate_lines_idx").on(t.estimateId)]);

export type Estimate = typeof estimates.$inferSelect;
