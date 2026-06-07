# Local database — persistence & protecting your data

This app uses Postgres in Docker. Your company data (organizations, accounts,
transactions, journal entries, …) lives in the **`ledgerly`** database, stored on the
named Docker volume **`qbo_qbo-pgdata`**.

## Your data persists by default
Named Docker volumes survive container stop / restart / recreate and `docker compose
down`. **Rebuilding or restarting the app never touches your data.** It is only lost by
the specific operations in the "Never run" list below.

## Start / stop the database
```bash
docker compose up -d      # start Postgres (reuses the existing data volume)
docker compose stop       # stop (data kept)
docker compose down       # remove the container (data kept — volume is external)
```
The app (API) connects to it at `postgres:5432` (inside Docker) / `localhost:5433`
(from the host). Database `ledgerly`, user/pass `qbo`/`qbo`.

## Backups (your safety net)
```bash
pnpm db:backup            # → backups/ledgerly-<timestamp>.dump
pnpm db:restore           # restore the latest dump into ledgerly_test (safe)
pnpm db:restore <file> ledgerly --force   # overwrite REAL data (deliberate, guarded)
```
**Rule: run `pnpm db:backup` before any schema change.** Backups live in `backups/`
(gitignored).

## Changing the schema safely (as you build features)
Schema changes are applied with `drizzle-kit push`:
```bash
pnpm db:backup                       # 1. always back up first
pnpm --filter @workspace/db push     # 2. apply schema changes (interactive)
```
- **Additive changes** (new tables / new columns) are non-destructive — this is the
  normal case when adding features.
- `push` **prompts before any data-loss change** (dropping/renaming a column or table).
  If you see a data-loss warning, **say no**, then make the change deliberately (e.g. a
  manual `ALTER` that preserves data) — and you already have a backup.
- The `push-force` script was removed because it applies destructive changes with no
  prompt. Don't reintroduce it.

## Testing without risking real data
Use the throwaway test database so development/verification never touches `ledgerly`:
```bash
pnpm db:reset-test        # drop+recreate `ledgerly_test` with the current schema (no data)
```
Run the API against it for testing by overriding the connection string:
`DATABASE_URL=postgresql://qbo:qbo@postgres:5432/ledgerly_test`.

## ⚠️ Never run (these destroy data)
- `docker compose down -v` or `docker volume rm qbo_qbo-pgdata` — deletes the volume.
- `drizzle-kit push --force` — silent destructive schema changes.
- `TRUNCATE` / `DROP DATABASE` / `DROP TABLE` against **`ledgerly`** — use `ledgerly_test`.
