import { Prisma } from "@prisma/client";
import { type DbClient } from "@/server/db/prisma";

/**
 * A minimal in-memory stand-in for the Prisma client.
 *
 * It implements exactly the operations the accounting engine uses, so the
 * engine's behaviour -- posting, reversal, transaction rollback, ledger
 * aggregation -- can be tested anywhere, with no database to install.
 *
 * What it does NOT emulate: the PostgreSQL CHECK constraints and immutability
 * triggers. Those are guarantees of the database itself and are covered by
 * `tests/integration/posting.test.ts`, which runs against a real server.
 */

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

type Row = Record<string, unknown>;

export interface SeedOptions {
  lockDate?: Date | null;
}

interface Store {
  companySettings: Row[];
  journal: Row[];
  sequence: Row[];
  ledgerAccount: Row[];
  contact: Row[];
  journalEntry: Row[];
  journalItem: Row[];
}

function clone(store: Store): Store {
  const cloneRow = (row: Row): Row => {
    const copy: Row = {};
    for (const [key, value] of Object.entries(row)) {
      copy[key] =
        value instanceof Decimal
          ? new Decimal(value)
          : value instanceof Date
            ? new Date(value)
            : value;
    }
    return copy;
  };

  return {
    companySettings: store.companySettings.map(cloneRow),
    journal: store.journal.map(cloneRow),
    sequence: store.sequence.map(cloneRow),
    ledgerAccount: store.ledgerAccount.map(cloneRow),
    contact: store.contact.map(cloneRow),
    journalEntry: store.journalEntry.map(cloneRow),
    journalItem: store.journalItem.map(cloneRow),
  };
}

/** Evaluates one Prisma-style filter value against a field. */
function matchesCondition(value: unknown, condition: unknown): boolean {
  if (condition === null) return value === null || value === undefined;

  if (
    typeof condition === "object" &&
    condition !== null &&
    !(condition instanceof Date) &&
    !(condition instanceof Decimal)
  ) {
    const c = condition as Record<string, unknown>;

    if ("in" in c) {
      const list = c.in as unknown[];
      return list.some((candidate) => matchesCondition(value, candidate));
    }
    if ("not" in c) return !matchesCondition(value, c.not);

    let ok = true;
    if ("gte" in c) ok &&= toTime(value) >= toTime(c.gte);
    if ("lte" in c) ok &&= toTime(value) <= toTime(c.lte);
    if ("gt" in c) ok &&= toTime(value) > toTime(c.gt);
    if ("lt" in c) ok &&= toTime(value) < toTime(c.lt);
    return ok;
  }

  if (value instanceof Date && condition instanceof Date) {
    return value.getTime() === condition.getTime();
  }

  return value === condition;
}

function toTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") return new Date(value).getTime();
  return Number.NaN;
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([field, condition]) =>
    matchesCondition(row[field], condition),
  );
}

function pick(row: Row, select: Row | undefined): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const [key, want] of Object.entries(select)) {
    if (want) out[key] = row[key];
  }
  return out;
}

function toDecimal(value: unknown): Decimal {
  if (value instanceof Decimal) return value;
  if (value === null || value === undefined) return new Decimal(0);
  return new Decimal(value as string | number);
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${String(idCounter).padStart(6, "0")}`;
}

export interface InMemoryDb {
  /** The Prisma-shaped client handed to services under test. */
  client: DbClient;
  /** Runs `fn` in a transaction, rolling every write back if it throws. */
  transaction: <T>(fn: (tx: DbClient) => Promise<T>) => Promise<T>;
  /** Direct access for assertions and fixtures. */
  store: Store;
  ids: {
    journalSales: string;
    journalBank: string;
    accountCash: string;
    accountBank: string;
    accountDebtors: string;
    accountCreditors: string;
    accountSales: string;
    accountPurchases: string;
    accountArchived: string;
    contact: string;
  };
}

export function createInMemoryDb(options: SeedOptions = {}): InMemoryDb {
  const ids = {
    journalSales: "journal_sales",
    journalBank: "journal_bank",
    accountCash: "account_cash",
    accountBank: "account_bank",
    accountDebtors: "account_debtors",
    accountCreditors: "account_creditors",
    accountSales: "account_sales",
    accountPurchases: "account_purchases",
    accountArchived: "account_archived",
    contact: "contact_nimesh",
  };

  const store: Store = {
    companySettings: [{ id: "company", name: "Urban Furniture", lockDate: options.lockDate ?? null }],
    journal: [
      {
        id: ids.journalSales,
        code: "SAL",
        name: "Sales Journal",
        type: "SALES",
        sequenceCode: "customer_invoice",
        isArchived: false,
      },
      {
        id: ids.journalBank,
        code: "BNK",
        name: "Bank Journal",
        type: "BANK",
        sequenceCode: "journal_entry",
        isArchived: false,
      },
      {
        id: "journal_archived",
        code: "OLD",
        name: "Retired Journal",
        type: "MISCELLANEOUS",
        sequenceCode: "journal_entry",
        isArchived: true,
      },
    ],
    sequence: [
      { id: "seq_1", code: "customer_invoice", prefix: "INV/", padding: 5, nextValue: 1 },
      { id: "seq_2", code: "journal_entry", prefix: "JE/", padding: 5, nextValue: 1 },
    ],
    ledgerAccount: [
      { id: ids.accountCash, code: "1010", name: "Cash", type: "ASSET", kind: "CASH", parentId: null, isArchived: false },
      { id: ids.accountBank, code: "1020", name: "Bank", type: "ASSET", kind: "BANK", parentId: null, isArchived: false },
      { id: ids.accountDebtors, code: "1100", name: "Debtors", type: "ASSET", kind: "RECEIVABLE", parentId: null, isArchived: false },
      { id: ids.accountCreditors, code: "2100", name: "Creditors", type: "LIABILITY", kind: "PAYABLE", parentId: null, isArchived: false },
      { id: ids.accountSales, code: "4100", name: "Sales Income", type: "INCOME", kind: "INCOME", parentId: null, isArchived: false },
      { id: ids.accountPurchases, code: "5100", name: "Purchases Expense", type: "EXPENSE", kind: "EXPENSE", parentId: null, isArchived: false },
      { id: ids.accountArchived, code: "9999", name: "Closed Account", type: "EXPENSE", kind: "OTHER", parentId: null, isArchived: true },
    ],
    contact: [{ id: ids.contact, name: "Nimesh Pathak" }],
    journalEntry: [],
    journalItem: [],
  };

  const makeClient = (state: Store): DbClient => {
    const client = {
      companySettings: {
        findUnique: async ({ where, select }: { where: Row; select?: Row }) => {
          const row = state.companySettings.find((r) => matches(r, where));
          return row ? pick(row, select) : null;
        },
      },

      journal: {
        findUnique: async ({ where, select }: { where: Row; select?: Row }) => {
          const row = state.journal.find((r) => matches(r, where));
          return row ? pick(row, select) : null;
        },
      },

      ledgerAccount: {
        findMany: async ({ where, select }: { where?: Row; select?: Row } = {}) =>
          state.ledgerAccount.filter((r) => matches(r, where)).map((r) => pick(r, select)),
      },

      sequence: {
        update: async ({ where, data, select }: { where: Row; data: Row; select?: Row }) => {
          const row = state.sequence.find((r) => matches(r, where));
          if (!row) throw new Error(`Sequence not found: ${JSON.stringify(where)}`);

          const increment = (data.nextValue as { increment?: number } | undefined)?.increment;
          if (typeof increment === "number") {
            row.nextValue = (row.nextValue as number) + increment;
          }
          return pick(row, select);
        },
      },

      journalEntry: {
        create: async ({ data }: { data: Row }) => {
          const { items, ...entryData } = data as Row & {
            items?: { create: Row[] };
          };

          const entry: Row = {
            id: nextId("entry"),
            reference: null,
            description: null,
            sourceType: null,
            sourceId: null,
            reversalOfId: null,
            createdById: null,
            postedById: null,
            postedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...entryData,
            totalDebit: toDecimal(entryData.totalDebit),
            totalCredit: toDecimal(entryData.totalCredit),
          };
          state.journalEntry.push(entry);

          for (const line of items?.create ?? []) {
            state.journalItem.push({
              id: nextId("item"),
              journalEntryId: entry.id,
              contactId: null,
              analyticAccountId: null,
              description: null,
              sequence: 0,
              createdAt: new Date(),
              ...line,
              debit: toDecimal(line.debit),
              credit: toDecimal(line.credit),
            });
          }

          return { ...entry };
        },

        findUnique: async ({ where, include }: { where: Row; include?: Row }) => {
          const row = state.journalEntry.find((r) => matches(r, where));
          if (!row) return null;

          const result: Row = { ...row };

          if (include?.items) {
            result.items = state.journalItem
              .filter((item) => item.journalEntryId === row.id)
              .sort((a, b) => (a.sequence as number) - (b.sequence as number))
              .map((item) => ({ ...item }));
          }
          if (include?.reversedBy) {
            const reversal = state.journalEntry.find((e) => e.reversalOfId === row.id);
            result.reversedBy = reversal ? { id: reversal.id } : null;
          }

          return result;
        },

        update: async ({ where, data }: { where: Row; data: Row }) => {
          const row = state.journalEntry.find((r) => matches(r, where));
          if (!row) throw new Error("Journal entry not found");
          Object.assign(row, data, { updatedAt: new Date() });
          if ("totalDebit" in data) row.totalDebit = toDecimal(data.totalDebit);
          if ("totalCredit" in data) row.totalCredit = toDecimal(data.totalCredit);
          return { ...row };
        },

        count: async ({ where }: { where?: Row } = {}) =>
          state.journalEntry.filter((r) => matches(r, where)).length,

        findMany: async ({ where }: { where?: Row } = {}) =>
          state.journalEntry.filter((r) => matches(r, where)).map((r) => ({ ...r })),
      },

      journalItem: {
        updateMany: async ({ where, data }: { where: Row; data: Row }) => {
          const rows = state.journalItem.filter((r) => matches(r, where));
          for (const row of rows) Object.assign(row, data);
          return { count: rows.length };
        },

        findMany: async ({ where, orderBy, select }: { where?: Row; orderBy?: unknown; select?: Row } = {}) => {
          const rows = state.journalItem.filter((r) => matches(r, where));

          const orders = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Row[];
          rows.sort((a, b) => {
            for (const order of orders) {
              const [field, direction] = Object.entries(order)[0] ?? [];
              if (!field) continue;
              const left = toTime(a[field]);
              const right = toTime(b[field]);
              const l = Number.isNaN(left) ? (a[field] as number) : left;
              const r = Number.isNaN(right) ? (b[field] as number) : right;
              if (l === r) continue;
              return direction === "desc" ? (r > l ? 1 : -1) : l > r ? 1 : -1;
            }
            return 0;
          });

          return rows.map((row) => {
            const out = pick(row, select);

            if (select?.contact) {
              const contact = state.contact.find((c) => c.id === row.contactId);
              out.contact = contact ? { name: contact.name } : null;
            }
            if (select?.journalEntry) {
              const entry = state.journalEntry.find((e) => e.id === row.journalEntryId);
              const journal = state.journal.find((j) => j.id === entry?.journalId);
              out.journalEntry = {
                number: entry?.number,
                journal: { code: journal?.code },
              };
            }
            return out;
          });
        },

        aggregate: async ({ where }: { where?: Row } = {}) => {
          const rows = state.journalItem.filter((r) => matches(r, where));
          return {
            _sum: {
              debit: rows.reduce((acc, r) => acc.plus(toDecimal(r.debit)), new Decimal(0)),
              credit: rows.reduce((acc, r) => acc.plus(toDecimal(r.credit)), new Decimal(0)),
            },
          };
        },

        groupBy: async ({ by, where }: { by: string[]; where?: Row }) => {
          const rows = state.journalItem.filter((r) => matches(r, where));
          const key = by[0] as string;
          const groups = new Map<unknown, Row[]>();

          for (const row of rows) {
            const value = row[key];
            const bucket = groups.get(value) ?? [];
            bucket.push(row);
            groups.set(value, bucket);
          }

          return [...groups.entries()].map(([value, bucket]) => ({
            [key]: value,
            _sum: {
              debit: bucket.reduce((acc, r) => acc.plus(toDecimal(r.debit)), new Decimal(0)),
              credit: bucket.reduce((acc, r) => acc.plus(toDecimal(r.credit)), new Decimal(0)),
            },
          }));
        },

        count: async ({ where }: { where?: Row } = {}) =>
          state.journalItem.filter((r) => matches(r, where)).length,
      },
    };

    return client as unknown as DbClient;
  };

  const live: { current: Store } = { current: store };

  return {
    client: makeClient(store),
    store,
    ids,

    /**
     * Snapshot / restore emulation of a database transaction: if `fn` throws,
     * every write made inside it is discarded.
     */
    async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
      const snapshot = clone(live.current);
      try {
        return await fn(makeClient(live.current));
      } catch (error) {
        const restored = snapshot;
        live.current.companySettings = restored.companySettings;
        live.current.journal = restored.journal;
        live.current.sequence = restored.sequence;
        live.current.ledgerAccount = restored.ledgerAccount;
        live.current.contact = restored.contact;
        live.current.journalEntry = restored.journalEntry;
        live.current.journalItem = restored.journalItem;
        throw error;
      }
    },
  };
}
