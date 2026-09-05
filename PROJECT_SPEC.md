# Urban Furniture — Accounting System · Project Specification

> Source of truth for **what** the system must do.
> For **how** it is built, see [ARCHITECTURE.md](./ARCHITECTURE.md).
> For **when**, see [TODO.md](./TODO.md).
> Original brief: `docs/Urban Furniture Accounting System.pdf`.

---

## 1. Overview

Urban Furniture buys and sells furniture (office chairs, wooden tables, sofas, dining
tables). The system replaces spreadsheet bookkeeping with a double-entry accounting
application that:

1. Holds **core master data** — Contacts, Products, Chart of Accounts, Journals,
   Analytic Accounts, Budgets.
2. Records **purchases, sales and payments** on top of that master data.
3. Generates **financial reports** — Balance Sheet, Profit & Loss, Budget Report —
   directly from the ledger, with no manual re-keying.

The defining constraint: **every posted transaction is a balanced double-entry journal
entry**. Reports are never computed from documents; they are computed from the ledger the
documents produce. This makes the reports auditable and self-consistent by construction.

**Currency:** single currency (INR by default, configurable). Multi-currency is out of
scope for v1.

---

## 2. Primary Actors

| Actor                       | Role code    | Description                                                                                                                         |
| --------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Business Owner              | `ADMIN`      | Full control: master data (create/modify/archive), transactions, reports, users, company settings, period locking.                  |
| Accountant / Invoicing User | `ACCOUNTANT` | Creates master data, records transactions, views reports. **Cannot** archive master data, manage users, or change company settings. |
| Contact (portal user)       | `CONTACT`    | Created from a Contact master record. Sees **only their own** invoices/bills and registers payments against them. Nothing else.     |
| System                      | —            | Validates data, computes taxes and totals, generates journal entries, maintains the ledger, produces reports.                       |

### 2.1 Permission matrix

Legend: yes = allowed · no = denied · own = own records only

| Capability                                                              | ADMIN | ACCOUNTANT | CONTACT |
| ----------------------------------------------------------------------- | :---: | :--------: | :-----: |
| View master data (contacts, products, CoA, journals, analytic accounts) |  yes  |    yes     |   no    |
| Create / update master data                                             |  yes  |    yes     |   no    |
| Archive / unarchive master data                                         |  yes  |     no     |   no    |
| Create & confirm purchase orders / sales orders                         |  yes  |    yes     |   no    |
| Create vendor bills / customer invoices                                 |  yes  |    yes     |   no    |
| **Post** a bill / invoice / payment to the ledger                       |  yes  |    yes     |   no    |
| Create manual journal entries                                           |  yes  |    yes     |   no    |
| Reverse / cancel a posted entry                                         |  yes  |     no     |   no    |
| Register a payment                                                      |  yes  |    yes     |   own   |
| View own invoices / bills                                               |  yes  |    yes     |   own   |
| View Balance Sheet, P&L, Budget Report, ledgers                         |  yes  |    yes     |   no    |
| Manage budgets                                                          |  yes  |    yes     |   no    |
| Manage users & roles                                                    |  yes  |     no     |   no    |
| Company settings & accounting lock date                                 |  yes  |     no     |   no    |

---

## 3. Master Data Modules

### 3.1 Contact Master

Customers and vendors — one model, typed.

| Field                              | Type                           | Notes                                       |
| ---------------------------------- | ------------------------------ | ------------------------------------------- |
| name                               | text                           | required                                    |
| type                               | `CUSTOMER` / `VENDOR` / `BOTH` | required                                    |
| email                              | text                           | optional; required to create a portal login |
| mobile                             | text                           | optional                                    |
| addressLine1 / addressLine2        | text                           | optional                                    |
| city / state / pincode             | text                           | optional                                    |
| profileImage                       | url                            | optional                                    |
| receivableAccount / payableAccount | FK to Chart of Accounts        | optional override of company defaults       |
| isArchived                         | boolean                        | soft archive — contacts are never deleted   |

Rules:

- A contact with posted transactions can be **archived**, never deleted.
- A `CUSTOMER` cannot be selected as the vendor on a purchase document, and vice versa
  (`BOTH` is valid on either side).
- Creating a Contact may optionally create a linked `CONTACT` portal user.

Examples: Vendor _Azure Furniture_, Vendor _Rahul Sharma_, Customer _Nimesh Pathak_.

### 3.2 Product Master

| Field                          | Type                          | Notes                                 |
| ------------------------------ | ----------------------------- | ------------------------------------- |
| name                           | text                          | required                              |
| sku                            | text                          | optional, unique                      |
| type                           | `GOODS` / `SERVICE` / `COMBO` | required                              |
| salesPrice                     | decimal(18,4)                 | default price on sales documents      |
| cost                           | decimal(18,4)                 | default price on purchase documents   |
| category                       | FK to ProductCategory         | optional                              |
| incomeAccount / expenseAccount | FK to Chart of Accounts       | override of defaults at posting time  |
| salesTax / purchaseTax         | FK to Tax                     | default tax applied on document lines |
| trackInventory                 | boolean                       | `GOODS` only — enables stock moves    |
| isArchived                     | boolean                       | soft archive                          |

Examples: Office Chair, Wooden Table, Sofa, Dining Table.

### 3.3 Chart of Accounts (CoA)

The master list of ledger accounts. Every financial transaction is classified into one.

| Field          | Type                                                     | Notes                                                                                                |
| -------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| code           | text                                                     | unique, e.g. `1100`                                                                                  |
| accountName    | text                                                     | required                                                                                             |
| type           | `ASSET` / `LIABILITY` / `EXPENSE` / `INCOME` / `CAPITAL` | drives which report the account lands in                                                             |
| kind           | enum                                                     | machine-readable role (`RECEIVABLE`, `PAYABLE`, `BANK`, `CASH`, `TAX_PAYABLE`, …) used by automation |
| parentAccount  | FK to self                                               | optional hierarchy for report grouping                                                               |
| isReconcilable | boolean                                                  | receivable/payable accounts settled by payments                                                      |
| isArchived     | boolean                                                  | soft archive                                                                                         |

Report mapping: `ASSET`, `LIABILITY`, `CAPITAL` produce the Balance Sheet;
`INCOME`, `EXPENSE` produce the Profit & Loss.

Seeded baseline:

- **Assets:** Cash, Bank, Debtors (Accounts Receivable), Inventory
- **Liabilities:** Creditors (Accounts Payable), Tax Payable
- **Capital:** Owner's Capital, Retained Earnings
- **Income:** Sales Income
- **Expenses:** Purchases Expense

### 3.4 Journal

Groups similar transactions and supplies default accounts.

| Field                                      | Type                                                     | Notes                                                   |
| ------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------- |
| code / name                                | text                                                     | code unique                                             |
| type                                       | `SALES` / `PURCHASE` / `BANK` / `CASH` / `MISCELLANEOUS` |                                                         |
| defaultDebitAccount / defaultCreditAccount | FK to CoA                                                |                                                         |
| paymentAccount                             | FK to CoA                                                | `BANK`/`CASH` journals: the account money moves through |
| sequenceCode                               | text                                                     | numbering series used for its entries                   |

Seeded: Sales Journal, Purchase Journal, Bank Journal, Cash Journal, Miscellaneous Journal.

### 3.5 Journal Entries

The actual accounting record. Header plus two or more items.

**Entry:** journal, date, reference, description, status, source document, control totals.
**Item:** account, debit, credit, description, contact, analytic account.

Invariants (see section 6):

- Sum of debits = sum of credits for every posted entry.
- Each item carries a value in **exactly one** of debit/credit; both are >= 0.
- Minimum two items.

Examples:

- Cash received from customer: **Dr** Cash, **Cr** Debtors
- Purchase on credit: **Dr** Purchases Expense, **Cr** Creditors

### 3.6 Analytic Account

A financial marker used to group income/expense by project, department or business unit,
independent of the Chart of Accounts. It is the dimension budgets are measured against.

Fields: code (unique), name, type (`INCOME` / `EXPENSE`), isArchived.

### 3.7 Budget

Fields: name, periodStart, periodEnd, responsible person, status
(`DRAFT` / `CONFIRMED` / `CLOSED`), revisionOf (previous version of the budget).

**Budget line:** analytic account, optional ledger account, type, **planned** amount,
**committed** amount (confirmed orders not yet posted), **achieved** amount (actual posted
ledger movement). Committed and achieved are recomputed from source data, never typed in.

---

## 4. Transaction Flow

```
Master Data
   |
   +--> Purchase Order --convert--> Vendor Bill ------post-----> Journal Entry --+
   |                                     |                                       |
   +--> Sales Order ----convert--> Customer Invoice --post-----> Journal Entry --+--> Ledger --> Reports
                                         |                                       |
                                         +--> Payment ----------post-----------> Journal Entry --+
```

| Step                 | Fields / details                                       | Ledger impact          |
| -------------------- | ------------------------------------------------------ | ---------------------- |
| **Purchase Order**   | vendor, order date, product, quantity, unit price, tax | none (commitment only) |
| **Vendor Bill**      | convert PO to bill, invoice date, due date             | **yes** on posting     |
| **Sales Order**      | customer, product, quantity, unit price, tax           | none (commitment only) |
| **Customer Invoice** | generate from SO, invoice date, due date               | **yes** on posting     |
| **Payment**          | register against bill/invoice, cash or bank            | **yes** on posting     |

### 4.1 Document lifecycles

- **Purchase Order:** `DRAFT -> CONFIRMED -> BILLED`, or `CANCELLED`
- **Sales Order:** `DRAFT -> CONFIRMED -> INVOICED`, or `CANCELLED`
- **Vendor Bill / Customer Invoice:** `DRAFT -> POSTED -> PARTIALLY_PAID -> PAID`, or `CANCELLED`
- **Payment:** `DRAFT -> POSTED`, or `CANCELLED`
- **Journal Entry:** `DRAFT -> POSTED`, or `CANCELLED`

Only the `DRAFT` state is editable. Posting freezes the document and writes the ledger.

### 4.2 Posting rules (the accounting contract)

Amounts below are per document; `untaxed` is the sum of line subtotals.

**Customer Invoice (posted to the Sales Journal)**

| Account                                  | Dr    | Cr      |
| ---------------------------------------- | ----- | ------- |
| Debtors (customer receivable)            | total |         |
| Sales Income (per line's income account) |       | untaxed |
| Tax Payable                              |       | tax     |

**Vendor Bill (posted to the Purchase Journal)**

| Account                                        | Dr      | Cr    |
| ---------------------------------------------- | ------- | ----- |
| Purchases Expense (per line's expense account) | untaxed |       |
| Tax Receivable (input tax)                     | tax     |       |
| Creditors (vendor payable)                     |         | total |

**Customer Payment — inbound (Bank/Cash Journal)**

| Account     | Dr     | Cr     |
| ----------- | ------ | ------ |
| Bank / Cash | amount |        |
| Debtors     |        | amount |

**Vendor Payment — outbound (Bank/Cash Journal)**

| Account     | Dr     | Cr     |
| ----------- | ------ | ------ |
| Creditors   | amount |        |
| Bank / Cash |        | amount |

Each posting also updates `amountPaid` / `amountResidual` on the settled document and moves
it to `PARTIALLY_PAID` or `PAID`. A payment may settle several documents; a document may be
settled by several payments.

### 4.3 Inventory (goods)

For products with `trackInventory`, posting a vendor bill records a stock move **in** and
posting a customer invoice records a stock move **out**, at the document's unit cost/price.
v1 uses **periodic inventory**: stock moves feed the stock report and on-hand quantity but
do not themselves post to the ledger. Perpetual inventory (automatic COGS postings) is a
documented Phase 8 extension.

---

## 5. Reporting Requirements

All reports are computed from **posted** journal items only. Draft and cancelled entries are
invisible to reporting.

### 5.1 Balance Sheet

Real-time snapshot **as at** a date.

- Assets (debit-positive) = Liabilities + Capital (credit-positive)
- Includes current-period net profit rolled into Capital, so the sheet always balances.
- Grouped by account type, then parent account, then account. Drill-down to the ledger.

### 5.2 Profit & Loss

For a **date range**.

- Income minus Expenses = Net Profit
- Grouped by account type, then parent, then account.
- Optional filter by analytic account.

### 5.3 Budget Report

For a budget's period, per budget line:
`planned` · `committed` · `achieved` · `variance (achieved - planned)` · `% achieved`.
Achieved comes from posted journal items carrying the line's analytic account.

### 5.4 Supporting reports

- **Trial Balance** — per-account debit/credit totals; a self-check that the ledger balances.
- **General Ledger / account statement** — every posted item on an account with a running balance.
- **Partner ledger / ageing** — outstanding receivables and payables per contact.
- **Stock report** — on-hand quantity and value per tracked product.

---

## 6. Accounting Invariants (non-negotiable)

1. **Balance.** A journal entry may only reach `POSTED` if sum(debit) = sum(credit), compared
   as exact decimals. Enforced in the posting service, by a database CHECK constraint on the
   entry's control totals, and covered by tests.
2. **One side per item.** Every journal item has a non-zero value in exactly one of
   debit/credit; both are >= 0.
3. **Decimal money.** All monetary values are `NUMERIC(18,2)` in Postgres and `Decimal` in
   the application. Floating-point arithmetic on money is prohibited and blocked by lint.
4. **Immutability.** A posted journal entry is never edited or deleted — a database trigger
   rejects both. Corrections are made by posting a **reversal** entry.
5. **Atomicity.** Any operation touching more than one accounting record runs inside a single
   database transaction. A failure leaves no partial ledger.
6. **Period lock.** No entry may be posted on or before the company lock date.
7. **History is preserved.** Master data is archived, never deleted, once referenced.
8. **Reports derive from the ledger.** No report reads document tables for financial figures.

---

## 7. Key Use-Case Walkthroughs

### 7.1 Create master data

1. Add contacts — _Azure Furniture_ (vendor), _Nimesh Pathak_ (customer).
2. Add products — _Wooden Chair_, _Office Chair_.
3. Set up the Chart of Accounts (seeded baseline, extended as needed).
4. Confirm journals and their default accounts.

### 7.2 Record a purchase

1. Create a Purchase Order for _Azure Furniture_.
2. On receipt of goods, convert the PO into a Vendor Bill.
3. Post the bill: Dr Purchases Expense / Dr Input Tax, Cr Creditors.
4. Register payment through Bank: Dr Creditors, Cr Bank. Bill becomes `PAID`.

### 7.3 Record a sale

1. Create a Sales Order for _Nimesh Pathak_ — 5 x Office Chair.
2. Generate the Customer Invoice and post it: Dr Debtors, Cr Sales Income / Cr Tax Payable.
3. Register payment through Cash or Bank: Dr Cash/Bank, Cr Debtors. Invoice becomes `PAID`.

### 7.4 Generate reports

1. Select the reporting period.
2. System produces the Balance Sheet, Profit & Loss and Budget Report from the ledger.

### 7.5 Contact portal

1. A portal user signs in and sees only documents belonging to their contact.
2. They open an outstanding invoice and register a payment against it.
3. The payment posts through the normal engine and reduces the invoice residual.

---

## 8. Non-Functional Requirements

| Area           | Requirement                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correctness    | Ledger integrity is enforced at three layers: service, database constraint, automated test.                                                                         |
| Auditability   | Every posted entry records who posted it and when, links back to its source document, and cannot be mutated. An `AuditLog` records master-data and posting actions. |
| Security       | Server-side authorisation on every mutation; portal users are scoped to their own contact; passwords hashed with bcrypt.                                            |
| Performance    | Reports must stay responsive at ~100k journal items — indexed on `(accountId, status, date)` and aggregated in Postgres, not in JavaScript.                         |
| Testability    | Business rules live in pure, injectable services; unit tests need no database, integration tests use a disposable one.                                              |
| Data integrity | Foreign keys, unique constraints, CHECK constraints and triggers — the database refuses invalid accounting data even if the application is bypassed.                |

---

## 9. Out of Scope for v1

Multi-currency · multi-company · perpetual inventory with automatic COGS postings ·
bank statement import and reconciliation · recurring invoices · tax return filing ·
fixed-asset depreciation schedules · payroll · e-invoicing/GST portal integration.
