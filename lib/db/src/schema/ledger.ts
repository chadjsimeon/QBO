import { pgTable, text, timestamp, integer, boolean, pgEnum, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { accounts } from "./accounts";

export const journalSourceTypeEnum = pgEnum("journal_source_type", [
  "INVOICE",
  "BILL",
  "PAYMENT",
  "MANUAL",
  "ADJUSTMENT",
  "BANK",
  "EXPENSE",
  "SALES_RECEIPT",
  "REFUND_RECEIPT",
  "CREDIT_NOTE",
  "VENDOR_CREDIT",
  "CC_CREDIT",
  "TRANSFER",
]);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    date: timestamp("date").notNull(),
    memo: text("memo"),
    sourceType: journalSourceTypeEnum("source_type").notNull(),
    sourceId: text("source_id"),
    isReversal: boolean("is_reversal").default(false).notNull(),
    reversedEntryId: text("reversed_entry_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("je_org_idx").on(t.organizationId),
    index("je_org_source_idx").on(t.organizationId, t.sourceType, t.sourceId),
    index("je_org_date_idx").on(t.organizationId, t.date),
  ],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    journalEntryId: text("journal_entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    debitCents: integer("debit_cents").default(0).notNull(),
    creditCents: integer("credit_cents").default(0).notNull(),
  },
  (t) => [index("jl_entry_idx").on(t.journalEntryId), index("jl_account_idx").on(t.accountId)],
);

export type JournalEntry = typeof journalEntries.$inferSelect;
export type JournalLine = typeof journalLines.$inferSelect;
