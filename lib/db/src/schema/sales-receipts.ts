import { pgTable, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { customers } from "./contacts";
import { accounts, taxRates } from "./accounts";

// An immediate cash sale (no A/R). Refund receipt is a sales receipt with
// isRefund = true (posting reversed). Posts on create:
//   sale:   debit deposit account (total), credit income lines + sales tax
//   refund: debit income lines + sales tax, credit deposit account (total)
export const salesReceipts = pgTable(
  "sales_receipts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: text("customer_id").references(() => customers.id),
    depositAccountId: text("deposit_account_id")
      .notNull()
      .references(() => accounts.id),
    number: text("number").notNull(),
    isRefund: boolean("is_refund").default(false).notNull(),
    date: timestamp("date").notNull(),
    memo: text("memo"),
    subtotalCents: integer("subtotal_cents").default(0).notNull(),
    taxCents: integer("tax_cents").default(0).notNull(),
    totalCents: integer("total_cents").default(0).notNull(),
    journalEntryId: text("journal_entry_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("sales_receipts_org_idx").on(t.organizationId)],
);

export const salesReceiptLineItems = pgTable(
  "sales_receipt_line_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    salesReceiptId: text("sales_receipt_id")
      .notNull()
      .references(() => salesReceipts.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    unitPriceCents: integer("unit_price_cents").default(0).notNull(),
    taxRateId: text("tax_rate_id").references(() => taxRates.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    amountCents: integer("amount_cents").default(0).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => [index("sales_receipt_lines_idx").on(t.salesReceiptId)],
);

export type SalesReceipt = typeof salesReceipts.$inferSelect;
export type SalesReceiptLineItem = typeof salesReceiptLineItems.$inferSelect;
