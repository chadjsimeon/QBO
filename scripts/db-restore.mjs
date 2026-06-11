// Restore a pg_dump file into a database.
// Usage:
//   pnpm db:restore                       restore latest backup into `ledgerly_test`
//   pnpm db:restore <file> [target]       restore a specific file into <target>
//   pnpm db:restore <file> ledgerly --force   overwrite your REAL data (guarded)
// See DATABASE.md.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, openSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.PG_CONTAINER || "qbo-postgres";
const backupsDir = path.join(ROOT, "backups");

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const positional = argv.filter((a) => !a.startsWith("--"));
let file = positional[0];
const target = positional[1] || "ledgerly_test";

// Default to the newest backup if no file given.
if (!file) {
  const dumps = existsSync(backupsDir)
    ? readdirSync(backupsDir)
        .filter((f) => f.endsWith(".dump"))
        .sort()
    : [];
  if (!dumps.length) {
    console.error("No .dump files found in backups/. Run `pnpm db:backup` first.");
    process.exit(1);
  }
  file = path.join(backupsDir, dumps[dumps.length - 1]);
}
if (!existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

if (target === "ledgerly" && !force) {
  console.error("Refusing to restore over 'ledgerly' (your real company data).");
  console.error("Use a test target:  pnpm db:restore <file> ledgerly_test");
  console.error("Or, deliberately:   pnpm db:restore <file> ledgerly --force");
  process.exit(1);
}

const docker = (args, opts = {}) => spawnSync("docker", args, { stdio: "inherit", ...opts });

// Ensure target DB exists (ignore "already exists").
docker(
  ["exec", CONTAINER, "psql", "-U", "qbo", "-d", "postgres", "-c", `CREATE DATABASE ${target}`],
  { stdio: "ignore" },
);

console.log(`Restoring ${path.basename(file)} → ${target} …`);
// pg_restore reads the dump from stdin; --clean --if-exists drops existing objects first.
const res = spawnSync(
  "docker",
  [
    "exec",
    "-i",
    CONTAINER,
    "pg_restore",
    "--clean",
    "--if-exists",
    "--no-owner",
    "-U",
    "qbo",
    "-d",
    target,
  ],
  { stdio: [openSync(file, "r"), "inherit", "inherit"] },
);
if (res.status === 0) console.log(`✓ Restored into ${target}`);
else {
  console.error(`✗ pg_restore exited ${res.status}`);
  process.exit(res.status ?? 1);
}
