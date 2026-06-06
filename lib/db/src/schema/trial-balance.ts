import { pgTable, text, timestamp, integer, boolean, pgEnum, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { journalEntries } from "./ledger";

export const trialBalanceImportStatusEnum = pgEnum("trial_balance_import_status", [
  "COMPLETED", "IN_PROGRESS", "FAILED",
]);

// Audit/lock record for a trial balance import. The actual opening balances live
// as a single ADJUSTMENT journal entry (journalEntryId) so they flow through the
// ledger like everything else; this table records who imported what, when.
export const trialBalanceImports = pgTable("trial_balance_imports", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  effectiveDate: timestamp("effective_date").notNull(),
  fileName: text("file_name"),
  totalAccounts: integer("total_accounts").default(0).notNull(),
  accountsCreated: integer("accounts_created").default(0).notNull(),
  accountsMatched: integer("accounts_matched").default(0).notNull(),
  totalDebitsCents: integer("total_debits_cents").default(0).notNull(),
  totalCreditsCents: integer("total_credits_cents").default(0).notNull(),
  balanced: boolean("balanced").default(false).notNull(),
  status: trialBalanceImportStatusEnum("status").default("COMPLETED").notNull(),
  journalEntryId: text("journal_entry_id").references(() => journalEntries.id),
  importedByName: text("imported_by_name"),
  locked: boolean("locked").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("tb_imports_org_idx").on(t.organizationId),
]);

export type TrialBalanceImport = typeof trialBalanceImports.$inferSelect;
