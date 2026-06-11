import { defineConfig } from "vitest/config";

// Integration tests hit a real Postgres. DATABASE_URL must point at the
// throwaway ledgerly_test database (tests/setup.ts hard-guards this);
// default matches the in-container dev URL from scripts/db-reset-test.mjs.
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://qbo:qbo@postgres:5432/ledgerly_test",
      SESSION_SECRET: "test-secret",
      NODE_ENV: "test",
    },
  },
});
