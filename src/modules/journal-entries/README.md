# `journal-entries` module

**Journal Entries** — Manual entries and ledger browsing.

Status: not yet implemented. Delivered in **Phase 3** (see [TODO.md](../../../TODO.md)).

## Scope

- Draft/post/reverse manual entries via `@/server/accounting`.
- Live balance preview using `checkBalance` (never posts an unbalanced entry).
- Read models for the general ledger and account statements.

## Expected files

| File                         | Responsibility                                                      |
| ---------------------------- | ------------------------------------------------------------------- |
| `schemas.ts`                 | Zod input schemas and inferred types, shared by server and forms.   |
| `journal-entries-service.ts` | Business rules. Takes a `DbClient`, throws domain errors.           |
| `actions.ts`                 | `"use server"` entry points: authorise, validate, call the service. |
| `queries.ts`                 | Read models for pages, with amounts serialised to strings.          |
| `components/`                | Module-specific React components.                                   |

## Rules

- No accounting arithmetic in components — it belongs in the service.
- Money is `Decimal` (`@/server/money`); never a JavaScript number.
- Anything writing more than one accounting record runs inside `withTransaction`.
- Ledger writes go through `@/server/accounting` only.
- Every action starts with `requirePermission(...)` from `@/server/auth/session`.
