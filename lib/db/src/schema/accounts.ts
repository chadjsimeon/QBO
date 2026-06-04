import { pgTable, text, timestamp, boolean, integer, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth";

export const accountTypeEnum = pgEnum("account_type", ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]);
export const systemRoleEnum = pgEnum("system_role", ["AR", "AP", "CASH", "SALES_TAX_PAYABLE", "RETAINED_EARNINGS"]);
export const cashFlowCategoryEnum = pgEnum("cash_flow_category", ["OPERATING", "INVESTING", "FINANCING", "NONE"]);

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull(),
  subtype: text("subtype").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  parentId: text("parent_id"),
  systemRole: systemRoleEnum("system_role"),
  cashFlowCategory: cashFlowCategoryEnum("cash_flow_category").default("NONE").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("accounts_org_code_idx").on(t.organizationId, t.code),
  index("accounts_org_idx").on(t.organizationId),
  index("accounts_org_role_idx").on(t.organizationId, t.systemRole),
]);

export const taxRates = pgTable("tax_rates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  rateBps: integer("rate_bps").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("tax_rates_org_idx").on(t.organizationId),
]);

export type Account = typeof accounts.$inferSelect;
export type TaxRate = typeof taxRates.$inferSelect;
