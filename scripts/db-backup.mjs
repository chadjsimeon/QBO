// Back up the local Ledgerly database to a timestamped pg_dump file in ./backups.
// Usage: pnpm db:backup        (dumps `ledgerly`)
// Run this before any schema change. See DATABASE.md.
import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.PG_CONTAINER || "qbo-postgres";
const DB = process.env.LEDGERLY_DB || "ledgerly";

const backupsDir = path.join(ROOT, "backups");
mkdirSync(backupsDir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19); // 2026-06-06T22-30-00
const outFile = path.join(backupsDir, `${DB}-${ts}.dump`);

// pg_dump custom format (-Fc) → restorable with pg_restore.
const out = createWriteStream(outFile);
const child = spawn("docker", ["exec", CONTAINER, "pg_dump", "-U", "qbo", "-d", DB, "-Fc"], {
  stdio: ["ignore", "pipe", "inherit"],
});
child.stdout.pipe(out);
child.on("error", (e) => {
  console.error(`Failed to run docker: ${e.message}`);
  process.exit(1);
});
out.on("close", () => {
  const size = statSync(outFile).size;
  if (size > 0)
    console.log(
      `✓ Backup written: backups/${path.basename(outFile)} (${(size / 1024).toFixed(1)} KB)`,
    );
});
child.on("close", (code) => {
  if (code !== 0) {
    console.error(`✗ pg_dump exited ${code}`);
    process.exit(code ?? 1);
  }
});
