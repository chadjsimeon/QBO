import { pgTable, text, timestamp, integer, boolean, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { accounts } from "./accounts";
import { customers, vendors } from "./contacts";
import { journalEntries } from "./ledger";

export const bankTxnStatusEnum = pgEnum("bank_txn_status", ["FOR_REVIEW", "CATEGORIZED", "EXCLUDED"]);
export const bankTxnMatchTypeEnum = pgEnum("bank_txn_match_type", ["MATCHED", "ADDED"]);
export const reconciliationStatusEnum = pgEnum("reconciliation_status", ["IN_PROGRESS", "COMPLETED"]);

export const bankAccounts = pgTable("bank_accounts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull().references(() => accounts.id),
  institutionName: text("institution_name").notNull(),
  accountMask: text("account_mask"),
  bankBalanceCents: integer("bank_balance_cents").default(0).notNull(),
  bankBalanceAsOf: timestamp("bank_balance_as_of"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("bank_accounts_org_gl_idx").on(t.organizationId, t.accountId),
  index("bank_accounts_org_idx").on(t.organizationId),
]);

export const bankTransactions = pgTable("bank_transactions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  bankAccountId: text("bank_account_id").notNull().references(() => bankAccounts.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  descriptionRaw: text("description_raw").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: bankTxnStatusEnum("status").default("FOR_REVIEW").notNull(),
  matchType: bankTxnMatchTypeEnum("match_type"),
  journalEntryId: text("journal_entry_id").references(() => journalEntries.id),
  categorizedAccountId: text("categorized_account_id").references(() => accounts.id),
  payeeVendorId: text("payee_vendor_id").references(() => vendors.id),
  payeeCustomerId: text("payee_customer_id").references(() => customers.id),
  memo: text("memo"),
  isCleared: boolean("is_cleared").default(false).notNull(),
  reconciliationId: text("reconciliation_id"),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
}, (t) => [
  index("bank_txns_org_status_idx").on(t.organizationId, t.bankAccountId, t.status),
  index("bank_txns_bank_idx").on(t.bankAccountId),
]);

export const reconciliations = pgTable("reconciliations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  bankAccountId: text("bank_account_id").notNull().references(() => bankAccounts.id, { onDelete: "cascade" }),
  statementDate: timestamp("statement_date").notNull(),
  statementBalanceCents: integer("statement_balance_cents").notNull(),
  beginningBalanceCents: integer("beginning_balance_cents").default(0).notNull(),
  status: reconciliationStatusEnum("status").default("IN_PROGRESS").notNull(),
  reconciledAt: timestamp("reconciled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("reconciliations_org_bank_idx").on(t.organizationId, t.bankAccountId),
]);

export type BankAccount = typeof bankAccounts.$inferSelect;
export type BankTransaction = typeof bankTransactions.$inferSelect;
export type Reconciliation = typeof reconciliations.$inferSelect;
