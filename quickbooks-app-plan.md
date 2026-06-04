# QuickBooks-Style Web App — Claude Code Kickoff Plan

This is the document to hand to Claude Code. It contains the kickoff prompt, the full
data model, the ledger engine spec, and the build order. Paste section 1 first; keep
the rest in the repo as `PLAN.md` for reference.

---

## 1. KICKOFF PROMPT (paste this into Claude Code first)

> I'm building a QuickBooks Online–style multi-tenant accounting web app. Set up the
> project and build as much of the MVP as you reasonably can in this session, in the
> phase order below. Stop and confirm with me at the end of each phase before moving on.
>
> **Stack (fixed — do not substitute):**
> - Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
> - PostgreSQL + Prisma
> - Auth.js (or Clerk) — multi-tenant, every record scoped to `organizationId`
> - Money stored as integer cents; `decimal.js` for all arithmetic — never floats
> - Deploy target: Vercel + managed Postgres (Neon)
>
> **Hard requirements:**
> 1. Full double-entry ledger from day one (spec in section 3). Every invoice, bill,
>    and payment posts balanced journal entries. Reports read from the ledger, not from
>    document tables.
> 2. Strict tenant isolation — every query filters by `organizationId`. Add a test that
>    fails if a query can return cross-tenant rows.
> 3. Ledger entries are append-only. Corrections happen via reversing entries, never edits.
> 4. Write a test after each accounting operation asserting `sum(debits) == sum(credits)`.
>
> Start with Phase 1. Set up the repo, Prisma schema (section 2), auth, tenant scoping,
> and seed data. Show me the schema and seed before writing feature code.

---

## 2. DATA MODEL

```
Organization        // tenant root — everything scopes to this
  id, name, createdAt

User
  id, email, name

OrgMembership        // join: a user's role within an org
  id, userId, organizationId, role (OWNER|ADMIN|MEMBER)

Account              // chart of accounts — self-referencing tree
  id, organizationId, code, name,
  type (ASSET|LIABILITY|EQUITY|INCOME|EXPENSE),
  subtype, isActive,
  parentId?            // ← null = top-level; else nests under another Account
  systemRole?          // ← AR|AP|CASH|SALES_TAX_PAYABLE|RETAINED_EARNINGS|null
                       //   how the ledger engine finds key accounts (not by code)
  cashFlowCategory     // OPERATING|INVESTING|FINANCING|NONE (future cash-flow stmt)
  sortOrder            // display ordering within a parent
  // Reports render this as a tree with a subtotal at each parent
  // ("Total for <parent>"), matching QBO's nested P&L / Balance Sheet.

Customer
  id, organizationId, name, email, phone, billingAddress

Vendor
  id, organizationId, name, email, phone, address

TaxRate
  id, organizationId, name, rateBps   // basis points, e.g. 8.25% = 825

Invoice
  id, organizationId, customerId, number,
  status (DRAFT|SENT|PARTIAL|PAID|OVERDUE|VOID),
  issueDate, dueDate, subtotalCents, taxCents, totalCents, balanceCents

InvoiceLineItem
  id, invoiceId, description, quantity, unitPriceCents,
  taxRateId, accountId, amountCents

Bill
  id, organizationId, vendorId, number,
  status (DRAFT|OPEN|PARTIAL|PAID|OVERDUE|VOID),
  issueDate, dueDate, subtotalCents, taxCents, totalCents, balanceCents

BillLineItem
  id, billId, description, quantity, unitPriceCents,
  taxRateId, accountId, amountCents

Payment
  id, organizationId, direction (RECEIVED|SENT),
  customerId?, vendorId?, amountCents, date, method

PaymentAllocation    // a payment can settle multiple invoices/bills
  id, paymentId, invoiceId?, billId?, amountCents

JournalEntry         // one balanced transaction in the ledger
  id, organizationId, date, memo,
  sourceType (INVOICE|BILL|PAYMENT|MANUAL|ADJUSTMENT),
  sourceId, isReversal, reversedEntryId?

JournalLine          // the debits/credits — must sum to zero per entry
  id, journalEntryId, accountId,
  debitCents, creditCents   // exactly one is non-zero per line

ManagementReport     // a saved, named, branded report bundle (→ PDF)
  id, organizationId, name,            // e.g. "Treasurer's Report"
  periodPreset (THIS_YEAR|THIS_YEAR_TO_DATE|THIS_MONTH|LAST_MONTH|CUSTOM),
  periodStart?, periodEnd?,            // used when CUSTOM
  basis (ACCRUAL|CASH),                // default ACCRUAL (cash = future)
  preparedByName?, confidentialityNote?,  // cover-page fields
  logoUrl?,                            // org's own logo for the cover
  lastModified

ManagementReportSection  // which reports, in what order, are in the bundle
  id, managementReportId,
  reportType (PROFIT_LOSS|PROFIT_LOSS_NONZERO|BALANCE_SHEET|
              CASH_FLOW|AR_AGING|AP_AGING),
  sortOrder
```

---

## 3. LEDGER ENGINE SPEC

The ledger is the source of truth. Build it as a single service module
(`lib/ledger.ts`) that all document operations call. No feature writes to
`JournalEntry`/`JournalLine` directly except through this module.

**Posting rules (which accounts get debited/credited):**

| Event | Debit | Credit |
|---|---|---|
| Invoice issued | Accounts Receivable | Income (per line) + Sales Tax Payable |
| Payment received | Cash / Bank | Accounts Receivable |
| Bill entered | Expense (per line) + Sales Tax Payable | Accounts Payable |
| Bill paid | Accounts Payable | Cash / Bank |
| Manual journal | user-specified | user-specified |

**Invariants the module must enforce:**
- Every `JournalEntry` has ≥ 2 lines and `sum(debit) == sum(credit)`.
- Each `JournalLine` has exactly one of `debitCents`/`creditCents` non-zero.
- Posting is atomic — wrap entry + lines + document status update in one DB transaction.
- No edits. To correct: create a reversing entry (`isReversal=true`, flipped
  debits/credits) then post a fresh correct entry.

**Reports derived from the ledger:**
- **P&L** = sum of INCOME accounts − sum of EXPENSE accounts over a date range.
- **Balance Sheet** = ASSET = LIABILITY + EQUITY, as of a date.
- **A/R Aging** = open invoice balances bucketed by days overdue.
- **A/P Aging** = open bill balances bucketed by days overdue.

**Report rendering rules (to match QBO output):**
- Render accounts as a **tree**, walking `parentId`. Each parent prints its children
  indented, then a `Total for <parent name>` subtotal line. Nesting can go >1 level deep.
- **"Non-Zero" variant** (e.g. "Profit and Loss - Non Zero"): suppress any account
  whose activity for the period is zero. This is a render-time filter, not stored data.
- Every report shows a **basis label** ("Accrual Basis") and a generated timestamp.
  MVP1 is accrual only; a cash/accrual toggle is deferred (see Standing Rules).
- Use account `type` for sign/section placement; use `systemRole` to locate AR, AP,
  Cash, and Sales Tax Payable rather than hardcoding codes (codes are user-defined
  and can be long, e.g. `5114744`).

Add a `trialBalance(orgId, asOf)` helper that returns every account's net debit/credit;
it must always balance. Use it as a health check in tests.

---

## 3b. MANAGEMENT REPORT (PDF) SPEC

A `ManagementReport` renders to a single multi-page PDF via **Puppeteer** (headless
Chrome printing an HTML page styled for `@media print`). On Vercel, use `puppeteer-core`
+ `@sparticuz/chromium`, or run the PDF route on a small separate Node service.

Structure of the generated PDF (mirrors the uploaded Treasurer's Report):
1. **Cover page** — org logo (`logoUrl`), report name, period label
   ("Year to date 3 June 2026"), "Prepared by" name, "Prepared on" date, and a
   confidentiality footer band ("Management Committee Only").
2. **Table of contents** — auto-generated from the report's sections, with page numbers.
3. **Report sections** — each `ManagementReportSection` in `sortOrder`, rendered with a
   running header (report title + basis) and footer (page X of N, timestamp/timezone).

Build the on-screen HTML report first; the PDF route is a thin layer that prints it.
Branding note: each org supplies its own logo for its reports. Do not embed QuickBooks/
Intuit branding anywhere in the app's own UI.

---

## 4. BUILD PHASES (order matters)

1. **Foundation** — repo, Next.js, Prisma schema, Auth.js, tenant-scoping middleware,
   seed data (one org, a default chart of accounts, sample customer/vendor).
2. **Chart of Accounts + Ledger engine** — `lib/ledger.ts`, trial balance, full test
   suite for balancing invariants. *This is the spine — get it solid before anything else.*
3. **Customers & Vendors** — simplest CRUD; validates the tenant-scoped data/UI patterns.
4. **Invoices** — create/edit/send, line items, tax, posts to ledger on issue.
5. **Bills & Expenses** — mirror of invoices on the payable side.
6. **Payments** — record received/sent, allocate to invoices/bills, post to ledger,
   update document balances/status.
7. **Reports** — P&L (incl. Non-Zero variant), Balance Sheet, A/R & A/P aging, all
   reading from the ledger and rendered as nested trees with subtotals. Accrual basis.
8. **Dashboard** — cash balance, P&L snapshot (income/expense), expenses-by-category
   donut, outstanding invoices, recent activity. Reads the same ledger data as reports.
9. **Management reports (PDF)** — `ManagementReport` builder UI (name, pick sections,
   period, logo, prepared-by), saved templates list, and Puppeteer PDF render with
   cover + TOC + sections (spec 3b).
10. **Polish** — PDF invoice export, email send, search/filter, empty states.

**MVP2 (next phase, not first session):**
- **Statement of Cash Flows (indirect method)** — uses `Account.cashFlowCategory` and
  two balance-sheet snapshots to compute working-capital changes. Needs posted
  transactions across ≥2 periods to validate; seed sample history before testing.
- Cash/accrual reporting toggle.

**Deferred (not in MVP):** payroll, inventory, multi-currency, recurring invoices,
bank feeds (Plaid), Stripe payments, mobile app.

---

## 5. STANDING RULES FOR THE WHOLE BUILD

- Money: integer cents in DB; `decimal.js` for math; format only at display.
- Every Prisma query filters by `organizationId`. Centralize this so it can't be forgotten.
- Ledger is append-only; corrections are reversals.
- Accounts form a tree (`parentId`); reports render nested with per-parent subtotals.
- Find key accounts (AR, AP, Cash, Sales Tax Payable) via `systemRole`, never by code.
- MVP1 reports are **accrual basis** only; the cash/accrual toggle is MVP2.
- Test `debits == credits` after every posting operation.
- Keep `PLAN.md` (this file) in the repo and update the phase checklist as you go.
