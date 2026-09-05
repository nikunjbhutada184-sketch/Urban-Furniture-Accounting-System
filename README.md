# Urban Furniture — Accounting System

A double-entry accounting application for Urban Furniture: master data, purchases, sales,
payments, and financial reports generated straight from the ledger.

| Document                             | Purpose                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| [PROJECT_SPEC.md](./PROJECT_SPEC.md) | Business requirements — **what** the system does                   |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Application, database, accounting, authorization, reporting design |
| [TODO.md](./TODO.md)                 | Implementation phases and current status                           |

## Stack

Next.js 16 (App Router) · TypeScript (strict) · PostgreSQL · Prisma 6 · Tailwind CSS v4 ·
shadcn/ui · Zod · Auth.js v5 · Vitest · Playwright

## Getting started

```bash
npm install
cp .env.example .env    # then fill in DATABASE_URL and AUTH_SECRET
npx auth secret         # generates AUTH_SECRET
```

Create the database schema and seed reference data:

```bash
npm run db:deploy && npm run db:seed
```

Run the app:

```bash
npm run dev
```

Development logins created by the seed (change them before any real deployment):

| Role       | Email                            | Password       |
| ---------- | -------------------------------- | -------------- |
| ADMIN      | `admin@urbanfurniture.test`      | `ChangeMe!123` |
| ACCOUNTANT | `accountant@urbanfurniture.test` | `ChangeMe!123` |
| CONTACT    | `nimesh.pathak@example.test`     | `ChangeMe!123` |

## Scripts

| Command                           | Description                                              |
| --------------------------------- | -------------------------------------------------------- |
| `npm run dev`                     | Start the development server                             |
| `npm run build`                   | Generate the Prisma client and build for production      |
| `npm run verify`                  | Typecheck, lint and unit tests — run before every commit |
| `npm run typecheck`               | `tsc --noEmit`                                           |
| `npm run lint` / `lint:fix`       | ESLint                                                   |
| `npm run format` / `format:check` | Prettier                                                 |
| `npm test` / `test:watch`         | Vitest                                                   |
| `npm run e2e`                     | Playwright end-to-end tests                              |
| `npm run db:migrate`              | Create and apply a migration (development)               |
| `npm run db:deploy`               | Apply existing migrations (CI / production)              |
| `npm run db:seed`                 | Seed reference and sample data                           |
| `npm run db:studio`               | Browse the database                                      |
| `npm run db:reset`                | Drop, re-migrate and re-seed (destroys data)             |

Integration tests that need a real database are skipped unless `TEST_DATABASE_URL` is set:

```bash
TEST_DATABASE_URL=postgresql://... npm test
```

## The rule that shapes everything

Every posted transaction is a balanced double-entry journal entry: **total debits equal
total credits**. This is enforced three times over —

1. in the posting service (`buildEntry` is the only way to produce a postable entry),
2. by PostgreSQL `CHECK` constraints and a deferred constraint trigger,
3. by tests that fail the moment either of the above stops working.

Posted entries are immutable — a database trigger refuses updates and deletes. Corrections
are made by posting a reversal. All money is `NUMERIC(18,2)` / `Decimal`; floating-point
arithmetic never touches a monetary value.

## Layout

```
src/app/        routing and rendering only
src/modules/    one folder per business domain (schemas, services, actions, components)
src/server/     accounting engine, auth, database, money, errors, sequences
prisma/         schema, migrations, seed
tests/          unit and integration tests
e2e/            Playwright specs
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full picture.
