import { pgTable, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { vendors } from "./contacts";
import { accounts, taxRates } from "./accounts";

// A direct purchase paid immediately (no A/P). Cheque is an Expense with
// method = "CHECK" and a refNumber. Posts on create: debit expense lines (+tax),
// credit the paid-from account (bank or credit card).
export const expenses = pgTable(
  "expenses",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vendorId: text("vendor_id").references(() => vendors.id),
    paymentAccountId: text("payment_account_id")
      .notNull()
      .references(() => accounts.id),
    number: text("number").notNull(),
    refNumber: text("ref_number"),
    method: text("method").default("BANK_TRANSFER").notNull(),
    isCredit: boolean("is_credit").default(false).notNull(), // true = credit card credit (reversed posting)
    date: timestamp("date").notNull(),
    memo: text("memo"),
    subtotalCents: integer("subtotal_cents").default(0).notNull(),
    taxCents: integer("tax_cents").default(0).notNull(),
    totalCents: integer("total_cents").default(0).notNull(),
    journalEntryId: text("journal_entry_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("expenses_org_idx").on(t.organizationId)],
);

export const expenseLineItems = pgTable(
  "expense_line_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
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
  (t) => [index("expense_lines_expense_idx").on(t.expenseId)],
);

export type Expense = typeof expenses.$inferSelect;
export type ExpenseLineItem = typeof expenseLineItems.$inferSelect;
