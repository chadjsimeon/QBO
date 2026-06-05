import { pgTable, text, timestamp, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { vendors } from "./contacts";
import { accounts, taxRates } from "./accounts";

// A purchase order — a non-posting purchase document. It can be converted into
// a DRAFT bill (which is then entered separately to post to the ledger).
export const poStatusEnum = pgEnum("po_status", ["DRAFT", "SENT", "CONVERTED", "CLOSED"]);

export const purchaseOrders = pgTable("purchase_orders", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  vendorId: text("vendor_id").notNull().references(() => vendors.id),
  number: text("number").notNull(),
  status: poStatusEnum("status").default("DRAFT").notNull(),
  issueDate: timestamp("issue_date").notNull(),
  expectedDate: timestamp("expected_date"),
  memo: text("memo"),
  subtotalCents: integer("subtotal_cents").default(0).notNull(),
  taxCents: integer("tax_cents").default(0).notNull(),
  totalCents: integer("total_cents").default(0).notNull(),
  convertedBillId: text("converted_bill_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("purchase_orders_org_idx").on(t.organizationId)]);

export const purchaseOrderLineItems = pgTable("purchase_order_line_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  purchaseOrderId: text("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  unitPriceCents: integer("unit_price_cents").default(0).notNull(),
  taxRateId: text("tax_rate_id").references(() => taxRates.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  amountCents: integer("amount_cents").default(0).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
}, (t) => [index("po_lines_idx").on(t.purchaseOrderId)]);

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
