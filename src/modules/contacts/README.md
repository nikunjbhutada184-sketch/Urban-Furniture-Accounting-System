# `contacts` module

**Contacts** — Customer and vendor master data.

Status: not yet implemented. Delivered in **Phase 3** (see [TODO.md](../../../TODO.md)).

## Scope

- Typed CRUD (`CUSTOMER` / `VENDOR` / `BOTH`), soft archive, never delete.
- Optional linked portal user (`UserRole.CONTACT`).
- Per-contact receivable/payable account overrides used by the posting engine.

## Expected files

| File                  | Responsibility                                                      |
| --------------------- | ------------------------------------------------------------------- |
| `schemas.ts`          | Zod input schemas and inferred types, shared by server and forms.   |
| `contacts-service.ts` | Business rules. Takes a `DbClient`, throws domain errors.           |
| `actions.ts`          | `"use server"` entry points: authorise, validate, call the service. |
| `queries.ts`          | Read models for pages, with amounts serialised to strings.          |
| `components/`         | Module-specific React components.                                   |

## Rules

- No accounting arithmetic in components — it belongs in the service.
- Money is `Decimal` (`@/server/money`); never a JavaScript number.
- Anything writing more than one accounting record runs inside `withTransaction`.
- Ledger writes go through `@/server/accounting` only.
- Every action starts with `requirePermission(...)` from `@/server/auth/session`.
