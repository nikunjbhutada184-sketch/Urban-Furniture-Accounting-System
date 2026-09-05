# `sales` module

**Sales** — Sales orders and customer invoices.

Status: not yet implemented. Delivered in **Phase 5** (see [TODO.md](../../../TODO.md)).

## Scope

- `SalesOrder`: draft, confirm, cancel. No ledger impact.
- SO to `CustomerInvoice` conversion, tracking `quantityInvoiced`.
- Posting an invoice: Dr debtors / Cr income + Cr tax payable, plus stock moves OUT.

## Expected files

| File               | Responsibility                                                      |
| ------------------ | ------------------------------------------------------------------- |
| `schemas.ts`       | Zod input schemas and inferred types, shared by server and forms.   |
| `sales-service.ts` | Business rules. Takes a `DbClient`, throws domain errors.           |
| `actions.ts`       | `"use server"` entry points: authorise, validate, call the service. |
| `queries.ts`       | Read models for pages, with amounts serialised to strings.          |
| `components/`      | Module-specific React components.                                   |

## Rules

- No accounting arithmetic in components — it belongs in the service.
- Money is `Decimal` (`@/server/money`); never a JavaScript number.
- Anything writing more than one accounting record runs inside `withTransaction`.
- Ledger writes go through `@/server/accounting` only.
- Every action starts with `requirePermission(...)` from `@/server/auth/session`.
