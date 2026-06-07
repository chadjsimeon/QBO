import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // The `session` table is created and owned at runtime by connect-pg-simple,
  // not by Drizzle. Exclude it so `drizzle-kit push` never tries to drop it
  // (which `push-force` would do non-interactively, logging everyone out).
  tablesFilter: ["!session"],
});
