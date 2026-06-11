import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { customers } from "./contacts";
import { accounts, taxRates } from "./accounts";
import { invoices } from "./invoices";

// A customer credit memo. Posts: debit income (+ sales tax), credit A/R — i.e.
// it lowers what the customer owes. The unapplied amount (balanceCents) can be
// applied against the customer's open invoices.
export const creditNotes = pgTable(
  "credit_notes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    number: text("number").notNull(),
    date: timestamp("date").notNull(),
    memo: text("memo"),
    subtotalCents: integer("subtotal_cents").default(0).notNull(),
    taxCents: integer("tax_cents").default(0).notNull(),
    totalCents: integer("total_cents").default(0).notNull(),
    balanceCents: integer("balance_cents").default(0).notNull(), // unapplied credit remaining
    journalEntryId: text("journal_entry_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("credit_notes_org_idx").on(t.organizationId)],
);

export const creditNoteLineItems = pgTable(
  "credit_note_line_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    creditNoteId: text("credit_note_id")
      .notNull()
      .references(() => creditNotes.id, { onDelete: "cascade" }),
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
  (t) => [index("credit_note_lines_idx").on(t.creditNoteId)],
);

export const creditNoteApplications = pgTable(
  "credit_note_applications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    creditNoteId: text("credit_note_id")
      .notNull()
      .references(() => creditNotes.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("credit_note_apps_idx").on(t.creditNoteId)],
);

export type CreditNote = typeof creditNotes.$inferSelect;
