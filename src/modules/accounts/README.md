# `accounts` module

**Chart of Accounts** — The ledger account master list.

Status: not yet implemented. Delivered in **Phase 3** (see [TODO.md](../../../TODO.md)).

## Scope

- CRUD over `LedgerAccount`, hierarchy via `parentId`, soft archive.
- `AccountType` decides which financial statement an account lands in.
- `AccountKind` is how automation finds special accounts -- never match on name.

## Expected files

| File                  | Responsibility                                                      |
| --------------------- | ------------------------------------------------------------------- |
| `schemas.ts`          | Zod input schemas and inferred types, shared by server and forms.   |
| `accounts-service.ts` | Business rules. Takes a `DbClient`, throws domain errors.           |
| `actions.ts`          | `"use server"` entry points: authorise, validate, call the service. |
| `queries.ts`          | Read models for pages, with amounts serialised to strings.          |
| `components/`         | Module-specific React components.                                   |

## Rules

- No accounting arithmetic in components — it belongs in the service.
- Money is `Decimal` (`@/server/money`); never a JavaScript number.
- Anything writing more than one accounting record runs inside `withTransaction`.
- Ledger writes go through `@/server/accounting` only.
- Every action starts with `requirePermission(...)` from `@/server/auth/session`.
