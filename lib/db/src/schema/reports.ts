import { pgTable, text, timestamp, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth";

export const periodPresetEnum = pgEnum("period_preset", [
  "THIS_YEAR", "THIS_YEAR_TO_DATE", "THIS_MONTH", "LAST_MONTH", "CUSTOM"
]);
export const reportBasisEnum = pgEnum("report_basis", ["ACCRUAL", "CASH"]);
export const managementReportTypeEnum = pgEnum("management_report_type", [
  "PROFIT_LOSS", "PROFIT_LOSS_NONZERO", "BALANCE_SHEET", "CASH_FLOW", "AR_AGING", "AP_AGING"
]);

export const managementReports = pgTable("management_reports", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  periodPreset: periodPresetEnum("period_preset").default("THIS_YEAR_TO_DATE").notNull(),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  basis: reportBasisEnum("basis").default("ACCRUAL").notNull(),
  preparedByName: text("prepared_by_name"),
  confidentialityNote: text("confidentiality_note"),
  logoUrl: text("logo_url"),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
}, (t) => [
  index("mgmt_reports_org_idx").on(t.organizationId),
]);

export const managementReportSections = pgTable("management_report_sections", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  managementReportId: text("management_report_id").notNull().references(() => managementReports.id, { onDelete: "cascade" }),
  reportType: managementReportTypeEnum("report_type").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
}, (t) => [
  index("mgmt_report_sections_report_idx").on(t.managementReportId),
]);

export type ManagementReport = typeof managementReports.$inferSelect;
export type ManagementReportSection = typeof managementReportSections.$inferSelect;
