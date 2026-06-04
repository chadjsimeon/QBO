import { pgTable, text, timestamp, integer, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { vendors } from "./contacts";
import { accounts, taxRates } from "./accounts";

export const billStatusEnum = pgEnum("bill_status", ["DRAFT", "OPEN", "PARTIAL", "PAID", "OVERDUE", "VOID"]);

export const bills = pgTable("bills", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  vendorId: text("vendor_id").notNull().references(() => vendors.id),
  number: text("number").notNull(),
  status: billStatusEnum("status").default("DRAFT").notNull(),
  issueDate: timestamp("issue_date").notNull(),
  dueDate: timestamp("due_date").notNull(),
  subtotalCents: integer("subtotal_cents").default(0).notNull(),
  taxCents: integer("tax_cents").default(0).notNull(),
  totalCents: integer("total_cents").default(0).notNull(),
  balanceCents: integer("balance_cents").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("bills_org_number_idx").on(t.organizationId, t.number),
  index("bills_org_idx").on(t.organizationId),
]);

export const billLineItems = pgTable("bill_line_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  billId: text("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  unitPriceCents: integer("unit_price_cents").default(0).notNull(),
  taxRateId: text("tax_rate_id").references(() => taxRates.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  amountCents: integer("amount_cents").default(0).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
}, (t) => [
  index("bill_lines_bill_idx").on(t.billId),
]);

export type Bill = typeof bills.$inferSelect;
export type BillLineItem = typeof billLineItems.$inferSelect;
