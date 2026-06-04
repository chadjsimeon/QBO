# Ledgerly — QuickBooks-style accounting (MVP)

A multi-tenant, double-entry accounting web app. The **ledger is the source of
truth**: every invoice, bill, and payment posts balanced journal entries, and
all reports read from the ledger — never from document tables.

## Stack

- **Next.js 15** (App Router) + TypeScript + Tailwind (shadcn-style UI primitives)
- **PostgreSQL + Prisma**
- **Auth.js (NextAuth v5)** — credentials, JWT sessions, every record scoped to `organizationId`
- Money stored as **integer cents**; `decimal.js` for all arithmetic (never floats)

## Quick start

```bash
# 1. Start Postgres (Docker). Maps host :5433 -> container :5432.
npm run db:up

# 2. Install deps (already done if node_modules exists)
npm install

# 3. Create the schema and seed a demo org + chart of accounts
npm run db:push
npm run db:seed

# 4. (Optional) post demo invoices/bills/a payment so reports have data
npx tsx prisma/demo-data.ts

# 5. Run the app
npm run dev   # http://localhost:3000  (we used 3100 during the build)
```

**Login:** `owner@acme.test` / `password123`

> The DB connection string lives in `.env` (`DATABASE_URL`, port **5433** to avoid
> clashing with another local Postgres). Copy `.env.example` to set up a fresh env.

## Tests

```bash
npm test
```

17 tests covering the spine:
- **Ledger invariants** — `sum(debits) == sum(credits)` after every posting op; line validation; reversals flip debits/credits.
- **Tenant isolation** — org-scoped queries never return another tenant's rows; `assertOrg` rejects cross-tenant records.
- **Reports** — P&L totals, Non-Zero suppression, Balance Sheet balances (`Assets == Liabilities + Equity`), A/R aging buckets.

## Architecture

| Concern | Location |
|---|---|
| Ledger engine (the spine) | `src/lib/ledger.ts` |
| Reporting engine | `src/lib/reports.ts` |
| Tenant scoping | `src/lib/tenant.ts` (session) + `src/lib/scope.ts` (pure) |
| Money math | `src/lib/money.ts` |
| Document line calc | `src/lib/documents.ts` |
| Prisma schema | `prisma/schema.prisma` |
| Seed / demo data | `prisma/seed.ts`, `prisma/demo-data.ts` |

### Ledger rules (enforced in `lib/ledger.ts`)
- Every entry has ≥ 2 lines and balances; each line has exactly one of debit/credit.
- Posting is atomic (entry + lines + document status in one transaction).
- **Append-only** — corrections are reversing entries, never edits.
- Key accounts (AR, AP, Cash, Sales Tax Payable) are found by `systemRole`, never by code.

## What's built (MVP1)

1. ✅ Foundation — schema, auth, tenant scoping, seed
2. ✅ Chart of Accounts + ledger engine + trial balance + tests
3. ✅ Customers & Vendors (CRUD)
4. ✅ Invoices — draft → issue (posts to ledger) → void (reversal)
5. ✅ Bills — mirror of invoices on the payable side
6. ✅ Payments — receive/pay, allocate to docs, post, update balances; delete reverses
7. ✅ Reports — P&L (+ Non-Zero), Balance Sheet, A/R & A/P aging, nested trees, accrual basis
8. ✅ Dashboard — cash, P&L snapshot, expenses donut, outstanding AR/AP, recent activity
9. ✅ Management reports — saved templates + printable bundle (cover + TOC + sections)

## Deferred / next

- **Puppeteer PDF route** for management reports (currently browser Print-to-PDF, which is already styled for `@media print`).
- Statement of Cash Flows (indirect), cash/accrual toggle (MVP2).
- PDF invoice export, email send, search/filter.
