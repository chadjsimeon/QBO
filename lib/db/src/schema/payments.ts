import { pgTable, text, timestamp, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { customers, vendors } from "./contacts";
import { invoices } from "./invoices";
import { bills } from "./bills";

export const paymentDirectionEnum = pgEnum("payment_direction", ["RECEIVED", "SENT"]);
export const paymentMethodEnum = pgEnum("payment_method", ["CASH", "CHECK", "CARD", "BANK_TRANSFER", "OTHER"]);

export const payments = pgTable("payments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  direction: paymentDirectionEnum("direction").notNull(),
  customerId: text("customer_id").references(() => customers.id),
  vendorId: text("vendor_id").references(() => vendors.id),
  amountCents: integer("amount_cents").notNull(),
  date: timestamp("date").notNull(),
  method: paymentMethodEnum("method").default("BANK_TRANSFER").notNull(),
  memo: text("memo"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("payments_org_idx").on(t.organizationId),
]);

export const paymentAllocations = pgTable("payment_allocations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  paymentId: text("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
  invoiceId: text("invoice_id").references(() => invoices.id),
  billId: text("bill_id").references(() => bills.id),
  amountCents: integer("amount_cents").notNull(),
}, (t) => [
  index("allocations_payment_idx").on(t.paymentId),
  index("allocations_invoice_idx").on(t.invoiceId),
  index("allocations_bill_idx").on(t.billId),
]);

export type Payment = typeof payments.$inferSelect;
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;
