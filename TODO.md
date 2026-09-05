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

## Phase 3 — Master data 🔜 NEXT

- [ ] Chart of Accounts: CRUD, hierarchy, archive, kind assignment
- [ ] Journals: CRUD with default accounts
- [ ] Contacts: CRUD, archive, optional portal user creation
- [ ] Products + categories: CRUD, archive, default accounts and taxes
- [ ] Taxes: CRUD
- [ ] Analytic accounts: CRUD
- [ ] Zod schemas shared by server actions and forms
- [ ] List/detail/form UI per module
- [ ] Unit tests for validation rules; E2E for the create-master-data walkthrough

**Checkpoint:** the spec's section 7.1 walkthrough completes through the UI.

---

## Phase 4 — Purchase flow

- [ ] Purchase Order: draft, lines with tax, totals, confirm, cancel
- [ ] PO → Vendor Bill conversion (quantities carried, `quantityBilled` tracked)
- [ ] Vendor Bill posting → journal entry (Dr expense + Dr input tax / Cr creditors)
- [ ] Stock moves IN for tracked goods
- [ ] Bill list/detail UI with status badges
- [ ] Integration test: PO → bill → posted entry, ledger balanced

**Checkpoint:** spec section 7.2 up to the posted bill.

---

## Phase 5 — Sales flow

- [ ] Sales Order: draft, lines with tax, totals, confirm, cancel
- [ ] SO → Customer Invoice conversion
- [ ] Invoice posting → journal entry (Dr debtors / Cr income + Cr tax payable)
- [ ] Stock moves OUT for tracked goods
- [ ] Invoice list/detail UI, printable invoice view
- [ ] Integration test: SO → invoice → posted entry, ledger balanced

**Checkpoint:** spec section 7.3 up to the posted invoice.

---

## Phase 6 — Payments & settlement

- [ ] Payment registration (inbound/outbound, cash/bank)
- [ ] Allocation against one or many bills/invoices, with over-allocation rejection
- [ ] Payment posting → journal entry; residual and status recomputation
- [ ] "Register payment" flow from a bill/invoice
- [ ] Integration tests: partial payment, full payment, over-allocation rejected,
      multi-document allocation

**Checkpoint:** an invoice reaches `PAID` and the customer's receivable balance is zero.

---

## Phase 7 — Reporting

- [ ] Trial Balance
- [ ] Balance Sheet (as-at date, current-period profit folded into Capital)
- [ ] Profit & Loss (date range, optional analytic filter)
- [ ] Budget Report (planned vs committed vs achieved vs variance)
- [ ] General ledger / account statement with running balance
- [ ] Partner ledger and ageing
- [ ] Stock report
- [ ] Report UI with period selector, drill-down and CSV export
- [ ] Integration tests asserting Assets = Liabilities + Capital after real document flows

**Checkpoint:** spec section 7.4 — reports reconcile to the ledger.

---

## Phase 8 — Portal, budgets & polish

- [ ] Contact portal: own invoices/bills, pay online, download PDF
- [ ] Budget CRUD, revisions, committed/achieved recomputation
- [ ] Company settings, fiscal year, accounting lock date
- [ ] User management (ADMIN)
- [ ] Audit log viewer
- [ ] Dashboard: receivables, payables, cash position, recent activity
- [ ] Full Playwright suite over all walkthroughs
- [ ] Accessibility and responsive pass

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
