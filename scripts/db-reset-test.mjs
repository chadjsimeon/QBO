// Drop & recreate the throwaway `ledgerly_test` database with the CURRENT schema
// (no data), for end-to-end testing without ever touching real `ledgerly` data.
// Usage: pnpm db:reset-test
import { spawnSync } from "node:child_process";

const CONTAINER = process.env.PG_CONTAINER || "qbo-postgres";
const TEST = "ledgerly_test";
const SRC = "ledgerly";

// Hard guard: this script must only ever operate on the test database.
if (TEST !== "ledgerly_test") {
  console.error("Refusing: test DB name changed.");
  process.exit(1);
}

const run = (args, opts = {}) => spawnSync("docker", args, { stdio: "inherit", ...opts });

console.log(`Recreating ${TEST} …`);
// Terminate connections, drop, recreate.
run(
  [
    "exec",
    CONTAINER,
    "psql",
    "-U",
    "qbo",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${TEST}' AND pid<>pg_backend_pid()`,
  ],
  { stdio: "ignore" },
);
run([
  "exec",
  CONTAINER,
  "psql",
  "-U",
  "qbo",
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
  `DROP DATABASE IF EXISTS ${TEST}`,
]);
run([
  "exec",
  CONTAINER,
  "psql",
  "-U",
  "qbo",
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
  `CREATE DATABASE ${TEST}`,
]);

// Copy schema only (no rows) from the real DB into the test DB, inside the container.
console.log(`Copying schema from ${SRC} (no data) …`);
const res = run([
  "exec",
  CONTAINER,
  "sh",
  "-c",
  `pg_dump -U qbo -d ${SRC} --schema-only | psql -U qbo -d ${TEST} -q`,
]);
if (res.status === 0)
  console.log(
    `✓ ${TEST} ready (empty, current schema). Point the API at it with DATABASE_URL=postgresql://qbo:qbo@postgres:5432/${TEST}`,
  );
else {
  console.error(`✗ schema copy exited ${res.status}`);
  process.exit(res.status ?? 1);
}
