import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { accounts } from "./accounts";

// A money movement between two of the org's own accounts (bank<->bank, or
// bank->credit-card for "pay down credit card"). Posts a 2-line journal entry.
export const transfers = pgTable(
  "transfers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    date: timestamp("date").notNull(),
    fromAccountId: text("from_account_id")
      .notNull()
      .references(() => accounts.id),
    toAccountId: text("to_account_id")
      .notNull()
      .references(() => accounts.id),
    amountCents: integer("amount_cents").notNull(),
    memo: text("memo"),
    journalEntryId: text("journal_entry_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("transfers_org_idx").on(t.organizationId)],
);

export type Transfer = typeof transfers.$inferSelect;
