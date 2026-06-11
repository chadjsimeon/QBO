import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { vendors } from "./contacts";
import { accounts, taxRates } from "./accounts";
import { bills } from "./bills";

// A supplier credit. Posts: debit A/P, credit expense (+ sales tax) — i.e. it
// lowers what you owe the vendor. The unapplied amount can be applied against
// the vendor's open bills.
export const vendorCredits = pgTable(
  "vendor_credits",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vendorId: text("vendor_id")
      .notNull()
      .references(() => vendors.id),
    number: text("number").notNull(),
    date: timestamp("date").notNull(),
    memo: text("memo"),
    subtotalCents: integer("subtotal_cents").default(0).notNull(),
    taxCents: integer("tax_cents").default(0).notNull(),
    totalCents: integer("total_cents").default(0).notNull(),
    balanceCents: integer("balance_cents").default(0).notNull(),
    journalEntryId: text("journal_entry_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("vendor_credits_org_idx").on(t.organizationId)],
);

export const vendorCreditLineItems = pgTable(
  "vendor_credit_line_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    vendorCreditId: text("vendor_credit_id")
      .notNull()
      .references(() => vendorCredits.id, { onDelete: "cascade" }),
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
  (t) => [index("vendor_credit_lines_idx").on(t.vendorCreditId)],
);

export const vendorCreditApplications = pgTable(
  "vendor_credit_applications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    vendorCreditId: text("vendor_credit_id")
      .notNull()
      .references(() => vendorCredits.id, { onDelete: "cascade" }),
    billId: text("bill_id")
      .notNull()
      .references(() => bills.id),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("vendor_credit_apps_idx").on(t.vendorCreditId)],
);

export type VendorCredit = typeof vendorCredits.$inferSelect;
