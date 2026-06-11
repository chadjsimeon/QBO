import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { organizations } from "./auth";

export const customers = pgTable(
  "customers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    billingAddress: text("billing_address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("customers_org_idx").on(t.organizationId)],
);

export const vendors = pgTable(
  "vendors",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("vendors_org_idx").on(t.organizationId)],
);

export type Customer = typeof customers.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
