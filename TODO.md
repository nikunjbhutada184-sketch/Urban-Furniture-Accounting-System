# Urban Furniture — Accounting System · Implementation Plan

Phases are ordered so that the accounting core is correct before any feature is built on it.
**Each phase ends at a working, tested checkpoint.** Do not start a phase before the previous
one's checkpoint passes.

Legend: `[x]` done · `[ ]` not started · `[~]` in progress

---

## Phase 0 — Foundation ✅

- [x] Inspect repository, extract requirements from the original brief
- [x] Initialise Next.js 16 + TypeScript (strict) + Tailwind v4 + App Router
- [x] Domain-oriented folder structure (`app` / `modules` / `server`)
- [x] `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `TODO.md`
- [x] `.env.example`
- [x] ESLint (incl. rules banning DB access in UI and floats on money), Prettier, strict `tsconfig`
- [x] Vitest + Playwright configured
- [x] shadcn/ui foundation (`components.json`, theme tokens, `cn`)

**Checkpoint:** `npm run typecheck && npm run lint` pass.

---

## Phase 1 — Database layer ✅

- [x] Complete Prisma schema: identity, master data, accounting core, purchase/sales flows,
      settlement, budgets, stock, audit
- [x] Explicit enums for every status and type
- [x] `Decimal` for all money and quantities
- [x] Indexes on foreign keys and dates; unique constraints on codes and document numbers
- [x] Soft-archive flags on master data; `createdAt`/`updatedAt` everywhere
- [x] Initial migration SQL
- [x] Hand-written constraints migration: balance CHECK, one-side-only CHECK,
      immutability triggers on posted entries, allocation-target CHECK
- [x] Seed script: company settings, sequences, Chart of Accounts, journals, taxes,
      analytic accounts, products, contacts, dev admin + accountant users
- [x] `prisma validate` + `prisma format` + `tsc --noEmit` clean

**Checkpoint:** `npm run db:deploy && npm run db:seed` on a fresh database, then
`npm run typecheck`.

---

## Phase 2 — Accounting core & auth ✅

- [x] Money helpers (`Decimal`, rounding, sum, line amounts)
- [x] Domain error taxonomy
- [x] Sequence/numbering service
- [x] `buildEntry` — pure balance validation (rejects unbalanced entries)
- [x] `postJournalEntry` / `reverseJournalEntry`
- [x] Ledger primitive: `getAccountBalances`, trial balance, account statement
- [x] Permission matrix + `assertPermission`
- [x] Auth.js wiring: credentials provider, JWT with `role` + `contactId`, Prisma adapter
- [x] `src/proxy.ts` route protection per role group
- [x] Session helpers: `requireAuth`, `requireRole`, `requirePermission`,
      `canAccessContact` / `requireContactAccess`, `requireAccessScope`
- [x] Login page + application shell (sidebar, top bar, user menu, sign out)
- [x] Contact portal shell, scoped to the signed-in user's own contact
- [x] Unit tests: admin access, accountant limits, contact isolation, unauthenticated errors
- [x] Integration tests for posting + immutability triggers (run with `TEST_DATABASE_URL`)
- [ ] Run the integration suite against a live PostgreSQL instance

**Checkpoint:** an unbalanced entry cannot be posted (unit test green; integration test
awaiting a database), and each of the three roles resolves to the correct permission set.

---

## Phase 3 — Master data ✅

- [x] Chart of Accounts: CRUD, hierarchy (cycle-guarded), archive, kind assignment
- [x] Journals: CRUD with default and payment accounts
- [x] Contacts: CRUD, archive, type-change guards
- [x] Products + categories: CRUD, archive, default accounts and taxes
- [x] Taxes: option loader (full CRUD screen deferred — taxes are seeded)
- [x] Analytic accounts: CRUD
- [x] Zod schemas shared by server actions and forms
- [x] List/search/filter/sort/pagination + create/edit/archive UI per module
- [x] Empty states, loading skeletons, confirmation dialogs, server-side error mapping
- [x] Reusable `runFormAction` pipeline: authorise -> validate -> transaction -> revalidate
- [ ] E2E for the create-master-data walkthrough (needs a database)

**Checkpoint:** the spec's section 7.1 walkthrough completes through the UI.
Note: master data is **archived, never deleted** — every module has a reference
counter and there is deliberately no hard-delete path.

---

## Phase 4 — Purchase flow ✅

- [x] Purchase Order: draft, lines with tax, live totals, confirm, cancel
- [x] PO → Vendor Bill conversion (quantities carried, `quantityBilled` tracked)
- [x] Vendor Bill posting → journal entry (Dr expense + Dr input tax / Cr creditors)
- [x] Payment registration → journal entry (Dr creditors / Cr bank or cash)
- [x] Allocation, residual recomputation and status transitions
- [x] Stock moves IN for tracked goods
- [x] Order and bill list/detail UI with status badges and the posted entry shown
- [x] Guards: non-confirmed orders cannot be billed, over-payment refused,
      draft bills cannot be paid, paid bills cannot be paid again, archived
      vendors/products refused, negative quantity and price refused
- [x] Integration test: PO → bill → posted entry, ledger balanced

**Checkpoint:** spec section 7.2 up to the posted bill and the bank payment.

---

## Phase 5 — Sales flow ✅

- [x] Sales Order: draft, lines with tax, live totals, confirm, cancel
- [x] SO → Customer Invoice conversion (`quantityInvoiced` tracked)
- [x] Invoice posting → journal entry (Dr debtors / Cr income + Cr tax payable)
- [x] Customer receipt → journal entry (Dr bank or cash / Cr debtors)
- [x] Allocation, residual recomputation and status transitions
- [x] Stock moves OUT for tracked goods
- [x] Order and invoice list/detail UI with status badges and the posted entry shown
- [x] Customer outstanding report (documents vs ledger, with overdue flagging)
- [x] Guards: only confirmed orders can be invoiced (no duplicate invoice),
      over-payment refused, draft invoices cannot be paid, paid invoices cannot
      be paid again, a vendor cannot be a customer, archived products refused,
      negative quantity and price refused, invalid status transitions refused
- [x] Integration test: SO → invoice → payment → ledger, against real PostgreSQL

**Checkpoint:** spec section 7.3 — 5 Office Chairs for Nimesh Pathak, invoiced,
paid, ledger balanced. Verified by `tests/integration/sales-flow.test.ts`.

### Shared components extracted in this phase

`OrderForm`, `ConvertDocumentDialog`, `PaymentDialog`, `DocumentActionButton`
and the status badges are now shared between purchases and sales, so the two
flows differ only in their services and labels — not in duplicated UI.

### Kanban views

- [x] List / Kanban toggle driven by `?view=`, preserving search, filter and sort
- [x] Contact kanban (image, name, email, mobile)
- [x] Product kanban (image, name, sales price, cost)
- [x] Budget kanban (period, status, achieved/balance donut), plus a Pie Chart
      column on both the budget list and the Budget Report

---

## Phase 6 — Payments & settlement ✅

- [x] Payment registration (inbound/outbound, cash/bank), standalone at `/payments/new`
- [x] Allocation against one or many bills/invoices, with over-allocation rejection;
      an unallocated remainder is held on the payment as an advance
- [x] Payment posting → journal entry; residual and status recomputed from the
      allocations rather than incremented
- [x] "Pay" flow from a bill/invoice, and from the invoice list
- [x] Integration tests: partial, full, over-allocation rejected, multi-document
      allocation, another contact's document refused, whole-payment rollback

**Checkpoint:** met — an invoice reaches `PAID` and the receivable clears.

---

## Phase 7 — Reporting ✅

- [x] Trial Balance
- [x] Balance Sheet (as-at date, current-period profit folded into Capital)
- [x] Profit & Loss (date range)
- [x] Budget Report (planned vs committed vs achieved vs variance), with a pie per line
- [x] General ledger / account statement with running balance
- [x] Partner ledger and ageing (five buckets, scoped so the portal can reuse them)
- [x] Stock report
- [x] Report UI with period selector, drill-down and CSV export
- [x] PDF download for Profit & Loss and Balance Sheet, rendered server-side from
      the same report service the screen uses
- [x] Integration tests asserting Assets = Liabilities + Capital after real document flows

**Checkpoint:** met — reports reconcile to the ledger.

Not done: the optional analytic filter on Profit & Loss. `getProfitAndLoss`
already accepts `analyticAccountId`; only the UI control is missing.

---

## Phase 8 — Portal, budgets & polish ✅

- [x] Contact portal: own invoices and bills, pay online, download the invoice PDF
- [x] Budget CRUD, revisions, committed/achieved recomputation
- [x] Company settings, fiscal year, accounting lock date (which cannot move backwards)
- [x] User management (ADMIN): create user with role, login-id/email uniqueness,
      password policy, deactivate/reactivate
- [x] Public sign-up (portal users only) and a login form keyed on login id
- [x] Audit log viewer (read-only, filterable by record type and action)
- [x] Dashboard: receivables, payables, cash position, recent activity
- [x] Playwright suite: 56 tests across anonymous, back-office and portal roles
- [x] Responsive pass: navigation drawer below `lg`, tables scroll in their own
      container, portal tabs work at every width

---

## Phase 9 — Production readiness

- [ ] Seed/demo data separation (dev fixtures never reachable in production)
- [ ] Structured logging and error reporting
- [ ] Backup and restore runbook
- [ ] CI: typecheck, lint, unit, integration (ephemeral Postgres), E2E
- [ ] Deployment guide and environment matrix
- [ ] Performance pass on reports with a large synthetic ledger
- [ ] Migrate `package.json#prisma` to `prisma.config.ts` (deprecated in Prisma 7)

---

## Deferred (explicitly out of scope for v1)

Multi-currency · multi-company · perpetual inventory with automatic COGS · bank statement
import and reconciliation · recurring invoices · tax filing · fixed-asset depreciation ·
payroll · e-invoicing integration.
