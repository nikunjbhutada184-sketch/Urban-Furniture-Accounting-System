# `budgets` module

**Budgets** — Planning and budget tracking.

Status: not yet implemented. Delivered in **Phase 8** (see [TODO.md](../../../TODO.md)).

## Scope

- Budget CRUD with period, responsible person and revisions (`revisionOf`).
- Lines hold planned amounts; committed and achieved are recomputed, never typed.
- Achieved comes from posted journal items carrying the line's analytic account.

## Expected files

| File                 | Responsibility                                                      |
| -------------------- | ------------------------------------------------------------------- |
| `schemas.ts`         | Zod input schemas and inferred types, shared by server and forms.   |
| `budgets-service.ts` | Business rules. Takes a `DbClient`, throws domain errors.           |
| `actions.ts`         | `"use server"` entry points: authorise, validate, call the service. |
| `queries.ts`         | Read models for pages, with amounts serialised to strings.          |
| `components/`        | Module-specific React components.                                   |

## Rules

- No accounting arithmetic in components — it belongs in the service.
- Money is `Decimal` (`@/server/money`); never a JavaScript number.
- Anything writing more than one accounting record runs inside `withTransaction`.
- Ledger writes go through `@/server/accounting` only.
- Every action starts with `requirePermission(...)` from `@/server/auth/session`.
