# Urban Furniture — Accounting System · Architecture

> **How** the system is built. For **what** it must do see [PROJECT_SPEC.md](./PROJECT_SPEC.md);
> for **when** see [TODO.md](./TODO.md).

---

## 0. Guiding principles

1. **The ledger is the product.** Documents (orders, bills, invoices, payments) are inputs.
   The general ledger is the single financial source of truth, and every report reads from it.
2. **Business logic lives in server-side services.** UI components render; they never compute
   an accounting figure. This is enforced by an ESLint rule that forbids UI files from
   importing the Prisma client.
3. **Money is Decimal, everywhere.** `NUMERIC(18,2)` in Postgres, `Prisma.Decimal` in the app.
   Floats never touch money. Lint blocks `parseFloat` on monetary paths.
4. **Multi-record accounting writes are transactional.** Services take a `DbClient` so they
   compose inside one `prisma.$transaction`.
5. **Correctness is defended in depth.** Every invariant is enforced in the service layer,
   again in the database, and pinned by a test.
6. **Modular and domain-oriented.** Each business domain owns its schemas, services and
   components; shared accounting machinery lives in one place and is reused.

---

## 1. Application Architecture

### 1.1 Stack

| Concern                  | Choice                                                                     |
| ------------------------ | -------------------------------------------------------------------------- |
| Framework                | Next.js 16 (App Router, React Server Components) + TypeScript strict       |
| Database                 | PostgreSQL 15+                                                             |
| ORM                      | Prisma 6                                                                   |
| Styling                  | Tailwind CSS v4                                                            |
| Components               | shadcn/ui (Radix + CVA)                                                    |
| Validation               | Zod (shared by server actions, route handlers and forms)                   |
| Auth                     | Auth.js (NextAuth v5) — credentials provider, JWT sessions, Prisma adapter |
| Unit / integration tests | Vitest                                                                     |
| E2E tests                | Playwright                                                                 |

### 1.2 Layers

```
┌──────────────────────────────────────────────────────────────┐
│ Presentation      src/app/**            RSC pages, layouts    │
│                   src/components/**     shadcn/ui + shared UI │
│   - renders only; no accounting maths, no direct DB access    │
├──────────────────────────────────────────────────────────────┤
│ Application       src/modules/<domain>/actions.ts             │
│   - server actions & route handlers                           │
│   - authenticate -> authorise -> Zod-validate -> call service │
│   - map domain errors to form/HTTP responses                  │
├──────────────────────────────────────────────────────────────┤
│ Domain services   src/modules/<domain>/*-service.ts           │
│   - business rules, state machines, document totals           │
│   - pure-ish: take a DbClient, return domain objects          │
├──────────────────────────────────────────────────────────────┤
│ Accounting core   src/server/accounting/**                    │
│   - posting engine, balance validation, ledger queries        │
│   - the ONLY writer of journal entries and items              │
├──────────────────────────────────────────────────────────────┤
│ Infrastructure    src/server/db · money · errors · sequence   │
│                   src/server/auth                             │
└──────────────────────────────────────────────────────────────┘
```

Dependencies point **downwards only**. A service never imports a React component; a UI
component never imports Prisma.

### 1.3 Folder structure

```
src/
├─ app/                          # routing & rendering only
│  ├─ (auth)/                    # sign-in, unauthenticated
│  ├─ (dashboard)/               # ADMIN + ACCOUNTANT workspace
│  ├─ (portal)/                  # CONTACT self-service portal
│  └─ api/                       # route handlers (auth, webhooks)
│
├─ modules/                      # one folder per business domain
│  ├─ contacts/                  # schemas.ts · service.ts · actions.ts · components/
│  ├─ products/
│  ├─ accounts/                  # Chart of Accounts
│  ├─ journals/
│  ├─ journal-entries/
│  ├─ purchases/                 # purchase orders + vendor bills
│  ├─ sales/                     # sales orders + customer invoices
│  ├─ payments/
│  ├─ analytic/                  # analytic accounts
│  ├─ budgets/
│  ├─ reporting/                 # balance sheet · P&L · budget report
│  └─ users/
│
├─ server/                       # cross-domain server infrastructure
│  ├─ accounting/                # posting engine, balance rules, ledger
│  ├─ auth/                      # Auth.js config, session, permissions
│  ├─ db/                        # Prisma client + transaction helper
│  ├─ money/                     # Decimal helpers — the only money maths
│  ├─ sequence/                  # document numbering
│  └─ errors/                    # domain error taxonomy
│
├─ components/ui/                # shadcn/ui primitives
└─ lib/                          # framework-agnostic client-safe helpers

prisma/    schema.prisma · migrations/ · seed.ts
tests/     unit/ · integration/ · helpers/
e2e/       Playwright specs
docs/      original brief
```

**Anatomy of a module** (every domain follows the same shape):

| File           | Responsibility                                                                  |
| -------------- | ------------------------------------------------------------------------------- |
| `schemas.ts`   | Zod input schemas + inferred types. Shared by server and client forms.          |
| `*-service.ts` | Business rules. Takes `DbClient`, throws domain errors, returns domain objects. |
| `actions.ts`   | `"use server"` entry points: auth, authorisation, validation, error mapping.    |
| `queries.ts`   | Read models for pages — shaped for the UI, amounts serialised to strings.       |
| `components/`  | Domain-specific React components.                                               |

---

## 2. Database Architecture

### 2.1 Design rules

| Rule                         | Implementation                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| Money is exact               | `Decimal @db.Decimal(18,2)`; quantities `(18,3)`; unit prices `(18,4)`; tax rates `(9,4)`        |
| History is preserved         | Master data carries `isArchived`; nothing referenced by accounting is deleted                    |
| Posted entries are immutable | Database trigger rejects `UPDATE`/`DELETE` on posted entries and their items                     |
| Statuses are explicit        | Postgres enums for every state and type — no magic strings                                       |
| Referential integrity        | Foreign keys throughout; `onDelete: Cascade` only from a header to its own lines                 |
| Uniqueness                   | `code`/`number` unique on accounts, journals, analytic accounts, taxes and every document series |
| Query performance            | Composite indexes on the hot paths, notably `journal_items(accountId, status, date)`             |
| Consistency                  | `createdAt` / `updatedAt` on every business table                                                |

### 2.2 Entity map

```
                    ┌──────────┐        ┌──────────────┐
                    │   User   │───────▶│   Contact    │  (portal user link)
                    └──────────┘        └──────┬───────┘
                                               │
        ┌──────────────┬─────────────┬─────────┴────────┬──────────────┐
        ▼              ▼             ▼                  ▼              ▼
  PurchaseOrder   SalesOrder    VendorBill       CustomerInvoice    Payment
        │              │             │                  │              │
        │ lines        │ lines       │ lines            │ lines        │ allocations
        ▼              ▼             ▼                  ▼              ▼
  POLine ──▶Product  SOLine       VBLine ──▶LedgerAccount  CILine   PaymentAllocation
                                     │                  │              │
                                     └──────┬───────────┴──────────────┘
                                            ▼  posting
                                    ┌───────────────┐   ┌──────────┐
                                    │ JournalEntry  │──▶│ Journal  │
                                    └───────┬───────┘   └──────────┘
                                            │ items
                                            ▼
                                    ┌───────────────┐   ┌────────────────┐
                                    │  JournalItem  │──▶│ LedgerAccount  │
                                    └───────┬───────┘   └────────────────┘
                                            │
                                            ▼
                                   ┌──────────────────┐   ┌─────────┐
                                   │ AnalyticAccount  │◀──│ Budget  │─▶ BudgetLine
                                   └──────────────────┘   └─────────┘
```

`LedgerAccount` is the Chart of Accounts. It is not called `Account` because the Auth.js
adapter reserves that table name for OAuth accounts (`auth_accounts`).

### 2.3 Table groups

| Group           | Tables                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Identity        | `users`, `auth_accounts`, `auth_sessions`, `auth_verification_tokens`                                     |
| Configuration   | `company_settings`, `sequences`                                                                           |
| Master data     | `contacts`, `products`, `product_categories`, `taxes`, `ledger_accounts`, `journals`, `analytic_accounts` |
| Accounting core | `journal_entries`, `journal_items`                                                                        |
| Purchase flow   | `purchase_orders`, `purchase_order_lines`, `vendor_bills`, `vendor_bill_lines`                            |
| Sales flow      | `sales_orders`, `sales_order_lines`, `customer_invoices`, `customer_invoice_lines`                        |
| Settlement      | `payments`, `payment_allocations`                                                                         |
| Planning        | `budgets`, `budget_lines`                                                                                 |
| Stock           | `stock_moves`                                                                                             |
| Audit           | `audit_logs`                                                                                              |

### 2.4 Database-level guarantees

Added by `prisma/migrations/**/constraints.sql` on top of the Prisma-generated DDL:

1. `journal_items_one_side_only` — CHECK: `debit >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0)`
2. `journal_entries_balanced_when_posted` — CHECK: a `POSTED` entry has `totalDebit = totalCredit`,
   plus `journal_entries_balance_check` / `journal_items_balance_check` — DEFERRED constraint
   triggers that re-verify at `COMMIT` that a posted entry's items sum equally and match its
   control totals, whatever order the rows were written in
3. `journal_entries_immutable` — trigger: rejects every `UPDATE` and `DELETE` on a posted
   entry. There is no edit path and no cancel path; corrections are reversals
4. `journal_items_immutable` — trigger: rejects `UPDATE`/`DELETE` of any posted item
5. `payment_allocations_exactly_one_target` — CHECK: exactly one of `vendorBillId`/`customerInvoiceId`
6. `*_amount_non_negative` — CHECK constraints on document totals and payment amounts
7. `budgets_period_valid` — CHECK: `periodEnd >= periodStart`

These hold even if someone bypasses the application and writes SQL directly.

### 2.5 Numbering

`sequences` holds `prefix`, `padding`, `nextValue` per document series. A number is consumed
with a single atomic `UPDATE ... RETURNING` **inside the caller's transaction**, so the row
lock serialises concurrent writers and a rolled-back document releases nothing partial.

---

## 3. Accounting Architecture

### 3.1 The posting engine

`src/server/accounting/` is the **only** code in the system permitted to write
`journal_entries` and `journal_items`. Every document that affects the books goes through it.

```
document service (invoice/bill/payment)
        │  builds a JournalEntryDraft: journal, date, source, lines[]
        ▼
buildEntry()            pure — validates and totals, no I/O
        │   • >= 2 lines
        │   • every line: debit >= 0, credit >= 0, exactly one non-zero
        │   • sum(debit) === sum(credit)   ← UnbalancedEntryError if not
        │   • total != 0
        ▼
postJournalEntry(tx)    inside the caller's transaction
        │   • period lock check   ← PeriodLockedError
        │   • consume sequence number
        │   • INSERT entry (status POSTED, control totals) + items
        ▼
    ledger
```

`buildEntry` is a pure function: no database, no clock, fully unit-testable. It is
impossible to reach the `INSERT` without passing through it.

### 3.2 Debit / credit convention

Each item stores non-negative `debit` and `credit`, one of which is zero. Signed balance is
always `debit - credit`:

| Account type | Natural balance | Increased by | Report        |
| ------------ | --------------- | ------------ | ------------- |
| ASSET        | Debit           | debit        | Balance Sheet |
| EXPENSE      | Debit           | debit        | Profit & Loss |
| LIABILITY    | Credit          | credit       | Balance Sheet |
| CAPITAL      | Credit          | credit       | Balance Sheet |
| INCOME       | Credit          | credit       | Profit & Loss |

Reports flip the sign for credit-natured accounts at presentation time only; the stored data
keeps one unambiguous convention.

### 3.3 Corrections

A posted entry is immutable. To correct it, `reverseJournalEntry` posts a **mirror entry**
(debits and credits swapped) linked by `reversalOfId`. The audit trail keeps both. Nothing is
ever rewritten or deleted.

### 3.4 Settlement

`PaymentAllocation` links a payment to the bills/invoices it settles — many-to-many, because
one payment can clear several invoices and one invoice can be cleared by several payments.
On posting, the payment service:

1. posts the cash/bank ↔ receivable/payable journal entry,
2. writes allocations, rejecting any that exceed a document's residual (`OverAllocationError`),
3. recomputes `amountPaid` / `amountResidual` and advances the document status,

all inside one transaction.

---

## 4. Authorization Architecture

### 4.1 Authentication

Auth.js v5 with a credentials provider (bcrypt-hashed passwords) and JWT sessions. The JWT
carries `userId`, `role` and, for portal users, `contactId`. The Prisma adapter persists
users and OAuth accounts so an SSO provider can be added later without a data migration.

### 4.2 Three enforcement points

```
1. src/proxy.ts        coarse route protection — is there a session, and does the
                       role match this route group? (redirects, never authorises data)

2. server action /     assertPermission(session, "invoice:post")
   route handler       every mutation starts here; the permission matrix is the
                       single source of truth (src/server/auth/permissions.ts)

3. service layer       ownership scoping — portal users get `where: { contactId }`
                       injected, so a CONTACT physically cannot query another
                       contact's documents even with a forged id
```

The proxy alone is never trusted: it does not run for direct server-action invocations, so
authorisation is re-checked server-side on every mutation, query, report and payment
operation via the helpers in `src/server/auth/session.ts` — `requireAuth`, `requireRole`,
`requirePermission`, `canAccessContact` / `requireContactAccess`, `requireAccessScope`.

### 4.3 Permission model

Permissions are strings like `contact:create`, `invoice:post`, `report:view`,
`master:archive`, `user:manage`. `ROLE_PERMISSIONS` maps each role to its set. Adding a
capability means adding one permission and one matrix entry — never an `if (role === ...)`
scattered through the codebase.

Portal (`CONTACT`) users additionally pass through an **ownership guard**: services accept an
`AccessScope` describing which contact the caller may see, and every query is filtered by it.

---

## 5. Transaction Flow (end to end)

Worked example — _"Post a customer invoice for 5 office chairs and receive payment by bank."_

```
1. UI (RSC page)
      form submit ──▶ postInvoiceAction(formData)

2. Server action        src/modules/sales/actions.ts
      auth()                          → session
      assertPermission("invoice:post")
      invoicePostSchema.parse(input)  → typed, validated input

3. Domain service       src/modules/sales/invoice-service.ts
      withTransaction(async (tx) => {

        a. load invoice + lines (FOR UPDATE semantics inside the tx)
        b. assert status === DRAFT                → InvalidStateTransitionError
        c. recompute totals from lines (Decimal)  → never trust client totals
        d. build the journal entry draft:
              Dr Debtors            total
              Cr Sales Income       untaxed   (per line income account)
              Cr Tax Payable        tax
        e. postJournalEntry(tx, draft)           ← balance enforced here
        f. update invoice: status POSTED, journalEntryId, residual = total
        g. stock moves OUT for tracked goods
        h. audit log entry
      })

4. Result
      revalidatePath("/invoices") · redirect to the invoice
      Any throw ⇒ the whole transaction rolls back: no entry, no status change,
      no half-written ledger.

5. Payment (same pattern)
      Dr Bank   amount
      Cr Debtors amount
      + allocation against the invoice, residual recomputed, status → PAID
```

Every ledger-affecting flow follows this identical five-step shape.

---

## 6. Reporting Architecture

### 6.1 Principle

Reports read **only** `journal_items` where `status = POSTED`, joined to `ledger_accounts`.
They never read invoice or bill tables for financial figures. Consequence: the Balance Sheet
and P&L cannot disagree with the ledger, and any document flow that posts correctly is
automatically reported correctly.

### 6.2 Pipeline

```
journal_items (POSTED, date range, optional analytic filter)
        │  GROUP BY accountId  →  SUM(debit), SUM(credit)     [in Postgres]
        ▼
AccountBalance[]  { accountId, code, name, type, debit, credit, balance }
        │
        ├─▶ Trial Balance     flat listing + grand-total assertion
        ├─▶ Balance Sheet     as-at date; ASSET | LIABILITY | CAPITAL
        │                     + current-period net profit folded into Capital
        ├─▶ Profit & Loss     date range; INCOME - EXPENSE = net profit
        └─▶ Budget Report     grouped by analyticAccountId instead of accountId,
                              joined to budget_lines: planned vs committed vs achieved
```

Aggregation happens in the database (`groupBy` / SQL `SUM`), never by loading rows into
JavaScript. `getAccountBalances` is the single shared primitive; each report is a thin,
independently testable projection over it.

### 6.3 Correctness checks

- The trial balance asserts `Σ debit = Σ credit` across the whole ledger.
- The balance sheet asserts `Assets = Liabilities + Capital` and surfaces any discrepancy
  rather than hiding it.
- Both assertions are covered by integration tests that post real documents first.

### 6.4 Performance

Composite index `journal_items(accountId, status, date)` serves every report query. If the
ledger later outgrows on-the-fly aggregation, the documented next step is a materialised
monthly balance table refreshed on posting — the report API is designed so this can be
swapped in behind `getAccountBalances` without touching any caller.

---

## 7. Testing Architecture

| Layer       | Tool                         | What it covers                                                                                                           |
| ----------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Unit        | Vitest                       | Decimal money maths, `buildEntry` balance rules, permission matrix, document total calculation. No database.             |
| Integration | Vitest + disposable Postgres | Posting flows end to end: bill → entry → payment → residual; trial balance sums to zero; posted entries reject mutation. |
| E2E         | Playwright                   | Sign-in, master data creation, the purchase and sales walkthroughs, report rendering.                                    |

The rule that matters: **no accounting invariant ships without a test that fails when it is
violated.** `tests/unit/accounting/balance.test.ts` is the canonical example — it asserts that
an unbalanced draft cannot be posted.
