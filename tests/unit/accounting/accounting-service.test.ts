import { beforeEach, describe, expect, it } from "vitest";
import {
  createJournalEntry,
  getAccountBalance,
  getAccountLedger,
  postJournalEntry,
  validateJournalEntry,
} from "@/server/accounting/accounting-service";
import { getTrialBalance } from "@/server/accounting/ledger-service";
import { postDraftEntry, reverseJournalEntry } from "@/server/accounting/posting-service";
import {
  ConflictError,
  InvalidJournalLineError,
  InvalidStateTransitionError,
  NotFoundError,
  PeriodLockedError,
  UnbalancedEntryError,
} from "@/server/errors";
import { type InMemoryDb, createInMemoryDb } from "~/tests/helpers/in-memory-db";

/**
 * Accounting engine tests.
 *
 * These exercise the engine end to end against an in-memory database, covering
 * posting, validation, reversal, transaction rollback, the ledger and the trial
 * balance. The PostgreSQL constraints and immutability triggers are separately
 * covered by tests/integration/posting.test.ts.
 */

let db: InMemoryDb;
const DATE = new Date("2026-04-15T00:00:00Z");

beforeEach(() => {
  db = createInMemoryDb();
});

function sale(debit: string, credit: string) {
  return {
    journalId: db.ids.journalSales,
    date: DATE,
    reference: "SO/00001",
    description: "Cash received from customer",
    lines: [
      { accountId: db.ids.accountCash, debit },
      { accountId: db.ids.accountDebtors, credit },
    ],
  };
}

// ---------------------------------------------------------------------------
// 1. Balanced entry succeeds
// ---------------------------------------------------------------------------
describe("1. a balanced entry posts", () => {
  it("writes a posted entry with both items", async () => {
    const entry = await db.transaction((tx) =>
      postJournalEntry(tx, sale("5000.00", "5000.00"), { userId: "user_admin" }),
    );

    expect(entry.status).toBe("POSTED");
    expect(entry.totalDebit.toFixed(2)).toBe("5000.00");
    expect(entry.totalCredit.toFixed(2)).toBe("5000.00");
    expect(entry.number).toBe("INV/00001");
    expect(db.store.journalItem).toHaveLength(2);
  });

  it("records the audit trail: source, reference, creator and timestamps", async () => {
    const entry = await db.transaction((tx) =>
      postJournalEntry(
        tx,
        {
          ...sale("1000.00", "1000.00"),
          sourceType: "CustomerInvoice",
          sourceId: "invoice_1",
        },
        { userId: "user_admin" },
      ),
    );

    expect(entry.sourceType).toBe("CustomerInvoice");
    expect(entry.sourceId).toBe("invoice_1");
    expect(entry.reference).toBe("SO/00001");
    expect(entry.createdById).toBe("user_admin");
    expect(entry.postedById).toBe("user_admin");
    expect(entry.postedAt).toBeInstanceOf(Date);
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  it("issues sequential document numbers", async () => {
    const first = await db.transaction((tx) => postJournalEntry(tx, sale("10.00", "10.00")));
    const second = await db.transaction((tx) => postJournalEntry(tx, sale("20.00", "20.00")));

    expect(first.number).toBe("INV/00001");
    expect(second.number).toBe("INV/00002");
  });
});

// ---------------------------------------------------------------------------
// 2. Unbalanced entry fails
// ---------------------------------------------------------------------------
describe("2. an unbalanced entry is refused", () => {
  it("throws UnbalancedEntryError and writes nothing", async () => {
    await expect(
      db.transaction((tx) => postJournalEntry(tx, sale("5000.00", "4000.00"))),
    ).rejects.toThrow(UnbalancedEntryError);

    expect(db.store.journalEntry).toHaveLength(0);
    expect(db.store.journalItem).toHaveLength(0);
  });

  it("is refused even when off by one paisa", async () => {
    await expect(
      db.transaction((tx) => postJournalEntry(tx, sale("5000.00", "4999.99"))),
    ).rejects.toThrow(UnbalancedEntryError);
  });
});

// ---------------------------------------------------------------------------
// 3 & 4. Debit-only / credit-only entries fail
// ---------------------------------------------------------------------------
describe("3. a debit-only entry is refused", () => {
  it("rejects two debits with no credit", async () => {
    await expect(
      db.transaction((tx) =>
        postJournalEntry(tx, {
          journalId: db.ids.journalSales,
          date: DATE,
          lines: [
            { accountId: db.ids.accountCash, debit: "100.00" },
            { accountId: db.ids.accountBank, debit: "100.00" },
          ],
        }),
      ),
    ).rejects.toThrow(UnbalancedEntryError);
  });
});

describe("4. a credit-only entry is refused", () => {
  it("rejects two credits with no debit", async () => {
    await expect(
      db.transaction((tx) =>
        postJournalEntry(tx, {
          journalId: db.ids.journalSales,
          date: DATE,
          lines: [
            { accountId: db.ids.accountSales, credit: "100.00" },
            { accountId: db.ids.accountDebtors, credit: "100.00" },
          ],
        }),
      ),
    ).rejects.toThrow(UnbalancedEntryError);
  });
});

// ---------------------------------------------------------------------------
// 5. Zero and negative amounts fail
// ---------------------------------------------------------------------------
describe("5. zero and negative amounts are refused", () => {
  it("rejects a zero-value entry", async () => {
    await expect(
      db.transaction((tx) => postJournalEntry(tx, sale("0.00", "0.00"))),
    ).rejects.toThrow(InvalidJournalLineError);
  });

  it("rejects negative amounts", async () => {
    await expect(
      db.transaction((tx) => postJournalEntry(tx, sale("-100.00", "-100.00"))),
    ).rejects.toThrow(InvalidJournalLineError);
  });

  it("rejects a line carrying both a debit and a credit", async () => {
    await expect(
      db.transaction((tx) =>
        postJournalEntry(tx, {
          journalId: db.ids.journalSales,
          date: DATE,
          lines: [
            { accountId: db.ids.accountCash, debit: "100.00", credit: "100.00" },
            { accountId: db.ids.accountDebtors, credit: "100.00" },
          ],
        }),
      ),
    ).rejects.toThrow(InvalidJournalLineError);
  });
});

// ---------------------------------------------------------------------------
// 6. Multiple journal lines
// ---------------------------------------------------------------------------
describe("6. multi-line entries", () => {
  it("posts an invoice with net and tax split across three lines", async () => {
    const entry = await db.transaction((tx) =>
      postJournalEntry(tx, {
        journalId: db.ids.journalSales,
        date: DATE,
        description: "Customer invoice with GST",
        lines: [
          { accountId: db.ids.accountDebtors, debit: "26550.00" },
          { accountId: db.ids.accountSales, credit: "22500.00" },
          { accountId: db.ids.accountCreditors, credit: "4050.00" },
        ],
      }),
    );

    expect(entry.totalDebit.toFixed(2)).toBe("26550.00");
    expect(entry.totalCredit.toFixed(2)).toBe("26550.00");
    expect(db.store.journalItem).toHaveLength(3);
  });

  it("preserves per-line description and analytic account", async () => {
    await db.transaction((tx) =>
      postJournalEntry(tx, {
        journalId: db.ids.journalSales,
        date: DATE,
        lines: [
          {
            accountId: db.ids.accountDebtors,
            debit: "500.00",
            description: "5 x Office Chair",
            contactId: db.ids.contact,
            analyticAccountId: "analytic_retail",
          },
          { accountId: db.ids.accountSales, credit: "500.00", description: "Sales income" },
        ],
      }),
    );

    const [first, second] = db.store.journalItem;
    expect(first).toMatchObject({
      description: "5 x Office Chair",
      contactId: db.ids.contact,
      analyticAccountId: "analytic_retail",
      sequence: 0,
    });
    expect(second).toMatchObject({ description: "Sales income", sequence: 1 });
  });
});

// ---------------------------------------------------------------------------
// 7. Reversal
// ---------------------------------------------------------------------------
describe("7. reversal", () => {
  it("posts a mirror entry linked to the original", async () => {
    const original = await db.transaction((tx) =>
      postJournalEntry(tx, sale("1000.00", "1000.00")),
    );

    const reversal = await db.transaction((tx) =>
      reverseJournalEntry(tx, original.id, { date: new Date("2026-04-20T00:00:00Z") }),
    );

    expect(reversal.reversalOfId).toBe(original.id);
    expect(reversal.description).toBe(`Reversal of ${original.number}`);
    expect(reversal.totalDebit.equals(reversal.totalCredit)).toBe(true);

    const items = db.store.journalItem.filter((i) => i.journalEntryId === reversal.id);
    // The original debited Cash and credited Debtors; the reversal is the mirror.
    expect(items[0]).toMatchObject({ accountId: db.ids.accountCash });
    expect((items[0]?.credit as { toFixed(n: number): string }).toFixed(2)).toBe("1000.00");
    expect((items[1]?.debit as { toFixed(n: number): string }).toFixed(2)).toBe("1000.00");
  });

  it("nets the account back to zero", async () => {
    const original = await db.transaction((tx) => postJournalEntry(tx, sale("750.00", "750.00")));
    await db.transaction((tx) => reverseJournalEntry(tx, original.id));

    const balance = await getAccountBalance(db.client, db.ids.accountCash);
    expect(balance.toFixed(2)).toBe("0.00");
  });

  it("refuses to reverse the same entry twice", async () => {
    const original = await db.transaction((tx) => postJournalEntry(tx, sale("100.00", "100.00")));
    await db.transaction((tx) => reverseJournalEntry(tx, original.id));

    await expect(
      db.transaction((tx) => reverseJournalEntry(tx, original.id)),
    ).rejects.toThrow(ConflictError);
  });

  it("refuses to reverse a draft entry", async () => {
    const draft = await db.transaction((tx) => createJournalEntry(tx, sale("100.00", "100.00")));

    await expect(db.transaction((tx) => reverseJournalEntry(tx, draft.id))).rejects.toThrow(
      InvalidStateTransitionError,
    );
  });

  it("refuses to reverse an entry that does not exist", async () => {
    await expect(db.transaction((tx) => reverseJournalEntry(tx, "nope"))).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// 8. Transaction rollback
// ---------------------------------------------------------------------------
describe("8. transaction rollback", () => {
  it("discards a posted entry when a later step in the same transaction fails", async () => {
    await expect(
      db.transaction(async (tx) => {
        await postJournalEntry(tx, sale("2500.00", "2500.00"));
        // Something downstream fails -- e.g. updating the source document.
        throw new Error("downstream failure");
      }),
    ).rejects.toThrow("downstream failure");

    expect(db.store.journalEntry).toHaveLength(0);
    expect(db.store.journalItem).toHaveLength(0);
  });

  it("rolls back the sequence number too, so no number is burned", async () => {
    await expect(
      db.transaction(async (tx) => {
        await postJournalEntry(tx, sale("100.00", "100.00"));
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    const entry = await db.transaction((tx) => postJournalEntry(tx, sale("100.00", "100.00")));
    expect(entry.number).toBe("INV/00001");
  });

  it("leaves earlier committed entries untouched", async () => {
    await db.transaction((tx) => postJournalEntry(tx, sale("300.00", "300.00")));

    await expect(
      db.transaction(async (tx) => {
        await postJournalEntry(tx, sale("400.00", "400.00"));
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(db.store.journalEntry).toHaveLength(1);
    expect(db.store.journalItem).toHaveLength(2);
  });

  it("writes nothing at all when the entry is unbalanced", async () => {
    await expect(
      db.transaction((tx) => postJournalEntry(tx, sale("100.00", "99.00"))),
    ).rejects.toThrow(UnbalancedEntryError);

    expect(db.store.journalEntry).toHaveLength(0);
    // The sequence must not have advanced either.
    expect(db.store.sequence.find((s) => s.code === "customer_invoice")?.nextValue).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 9. Account ledger
// ---------------------------------------------------------------------------
describe("9. account ledger", () => {
  beforeEach(async () => {
    // Cash: +5000, +2000, -1500  => 5500
    await db.transaction((tx) =>
      postJournalEntry(tx, {
        journalId: db.ids.journalSales,
        date: new Date("2026-04-01T00:00:00Z"),
        description: "Opening receipt",
        lines: [
          { accountId: db.ids.accountCash, debit: "5000.00" },
          { accountId: db.ids.accountDebtors, credit: "5000.00" },
        ],
      }),
    );
    await db.transaction((tx) =>
      postJournalEntry(tx, {
        journalId: db.ids.journalSales,
        date: new Date("2026-04-10T00:00:00Z"),
        description: "Second receipt",
        lines: [
          { accountId: db.ids.accountCash, debit: "2000.00" },
          { accountId: db.ids.accountDebtors, credit: "2000.00" },
        ],
      }),
    );
    await db.transaction((tx) =>
      postJournalEntry(tx, {
        journalId: db.ids.journalSales,
        date: new Date("2026-04-20T00:00:00Z"),
        description: "Supplier payment",
        lines: [
          { accountId: db.ids.accountPurchases, debit: "1500.00" },
          { accountId: db.ids.accountCash, credit: "1500.00" },
        ],
      }),
    );
  });

  it("computes a running balance in date order", async () => {
    const ledger = await getAccountLedger(db.client, db.ids.accountCash);

    expect(ledger.lines).toHaveLength(3);
    expect(ledger.lines[0]?.runningBalance.toFixed(2)).toBe("5000.00");
    expect(ledger.lines[1]?.runningBalance.toFixed(2)).toBe("7000.00");
    expect(ledger.lines[2]?.runningBalance.toFixed(2)).toBe("5500.00");
    expect(ledger.closingBalance.toFixed(2)).toBe("5500.00");
  });

  it("carries an opening balance when the period starts mid-history", async () => {
    const ledger = await getAccountLedger(db.client, db.ids.accountCash, {
      from: new Date("2026-04-05T00:00:00Z"),
    });

    // Everything before 5 April (the 5000 receipt) becomes the opening balance.
    expect(ledger.openingBalance.toFixed(2)).toBe("5000.00");
    expect(ledger.lines).toHaveLength(2);
    expect(ledger.closingBalance.toFixed(2)).toBe("5500.00");
  });

  it("exposes the entry number and journal on each line", async () => {
    const ledger = await getAccountLedger(db.client, db.ids.accountCash);

    expect(ledger.lines[0]?.entryNumber).toBe("INV/00001");
    expect(ledger.lines[0]?.journalCode).toBe("SAL");
    expect(ledger.lines[0]?.description).toBeNull();
  });

  it("computes a single account balance", async () => {
    expect((await getAccountBalance(db.client, db.ids.accountCash)).toFixed(2)).toBe("5500.00");
    expect((await getAccountBalance(db.client, db.ids.accountDebtors)).toFixed(2)).toBe("-7000.00");
    expect((await getAccountBalance(db.client, db.ids.accountPurchases)).toFixed(2)).toBe("1500.00");
  });

  it("filters an account balance by period", async () => {
    const balance = await getAccountBalance(db.client, db.ids.accountCash, {
      from: new Date("2026-04-05T00:00:00Z"),
      to: new Date("2026-04-15T00:00:00Z"),
    });

    expect(balance.toFixed(2)).toBe("2000.00");
  });

  it("ignores draft entries", async () => {
    await db.transaction((tx) =>
      createJournalEntry(tx, {
        journalId: db.ids.journalSales,
        date: DATE,
        lines: [
          { accountId: db.ids.accountCash, debit: "99999.00" },
          { accountId: db.ids.accountSales, credit: "99999.00" },
        ],
      }),
    );

    expect((await getAccountBalance(db.client, db.ids.accountCash)).toFixed(2)).toBe("5500.00");
  });
});

// ---------------------------------------------------------------------------
// 10. Trial balance
// ---------------------------------------------------------------------------
describe("10. trial balance", () => {
  it("balances after a series of postings", async () => {
    await db.transaction((tx) => postJournalEntry(tx, sale("5000.00", "5000.00")));
    await db.transaction((tx) =>
      postJournalEntry(tx, {
        journalId: db.ids.journalSales,
        date: DATE,
        lines: [
          { accountId: db.ids.accountPurchases, debit: "3200.00" },
          { accountId: db.ids.accountCreditors, credit: "3200.00" },
        ],
      }),
    );

    const trialBalance = await getTrialBalance(db.client);

    expect(trialBalance.isBalanced).toBe(true);
    expect(trialBalance.difference.toFixed(2)).toBe("0.00");
    expect(trialBalance.totalDebit.toFixed(2)).toBe("8200.00");
    expect(trialBalance.totalCredit.toFixed(2)).toBe("8200.00");
  });

  it("is balanced and empty for a ledger with no postings", async () => {
    const trialBalance = await getTrialBalance(db.client);

    expect(trialBalance.rows).toHaveLength(0);
    expect(trialBalance.isBalanced).toBe(true);
  });

  it("lists accounts in code order with their movements", async () => {
    await db.transaction((tx) => postJournalEntry(tx, sale("1000.00", "1000.00")));

    const { rows } = await getTrialBalance(db.client);

    expect(rows.map((row) => row.code)).toEqual(["1010", "1100"]);
    expect(rows[0]).toMatchObject({ name: "Cash", type: "ASSET" });
    expect(rows[0]?.debit.toFixed(2)).toBe("1000.00");
    expect(rows[0]?.balance.toFixed(2)).toBe("1000.00");
    expect(rows[1]?.balance.toFixed(2)).toBe("-1000.00");
  });

  it("stays balanced after a reversal", async () => {
    const entry = await db.transaction((tx) => postJournalEntry(tx, sale("640.00", "640.00")));
    await db.transaction((tx) => reverseJournalEntry(tx, entry.id));

    const trialBalance = await getTrialBalance(db.client);

    expect(trialBalance.isBalanced).toBe(true);
    expect(trialBalance.totalDebit.toFixed(2)).toBe("1280.00");
    expect(trialBalance.rows.every((row) => row.balance.isZero())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validation, drafts, accounts and period locks
// ---------------------------------------------------------------------------
describe("validateJournalEntry", () => {
  it("accepts a valid draft", async () => {
    const result = await validateJournalEntry(db.client, sale("100.00", "100.00"));

    expect(result).toMatchObject({
      valid: true,
      totalDebit: "100.00",
      totalCredit: "100.00",
      difference: "0.00",
      errors: [],
    });
  });

  it("reports the imbalance without throwing", async () => {
    const result = await validateJournalEntry(db.client, sale("100.00", "60.00"));

    expect(result.valid).toBe(false);
    expect(result.difference).toBe("40.00");
    expect(result.errors[0]).toContain("not balanced");
  });

  it("reports an account that does not exist", async () => {
    const result = await validateJournalEntry(db.client, {
      journalId: db.ids.journalSales,
      date: DATE,
      lines: [
        { accountId: "account_missing", debit: "100.00" },
        { accountId: db.ids.accountSales, credit: "100.00" },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("does not exist"))).toBe(true);
  });

  it("reports an archived account", async () => {
    const result = await validateJournalEntry(db.client, {
      journalId: db.ids.journalSales,
      date: DATE,
      lines: [
        { accountId: db.ids.accountArchived, debit: "100.00" },
        { accountId: db.ids.accountSales, credit: "100.00" },
      ],
    });

    expect(result.errors.some((e) => e.includes("archived"))).toBe(true);
  });

  it("reports an archived journal", async () => {
    const result = await validateJournalEntry(db.client, {
      journalId: "journal_archived",
      date: DATE,
      lines: [
        { accountId: db.ids.accountCash, debit: "100.00" },
        { accountId: db.ids.accountSales, credit: "100.00" },
      ],
    });

    expect(result.errors.some((e) => e.includes("archived"))).toBe(true);
  });

  it("reports an entry with no journal items", async () => {
    const result = await validateJournalEntry(db.client, {
      journalId: db.ids.journalSales,
      date: DATE,
      lines: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("at least two lines"))).toBe(true);
  });
});

describe("posting refuses invalid accounts", () => {
  it("throws NotFoundError for an unknown account", async () => {
    await expect(
      db.transaction((tx) =>
        postJournalEntry(tx, {
          journalId: db.ids.journalSales,
          date: DATE,
          lines: [
            { accountId: "account_missing", debit: "100.00" },
            { accountId: db.ids.accountSales, credit: "100.00" },
          ],
        }),
      ),
    ).rejects.toThrow(NotFoundError);

    expect(db.store.journalEntry).toHaveLength(0);
  });

  it("throws for an archived account", async () => {
    await expect(
      db.transaction((tx) =>
        postJournalEntry(tx, {
          journalId: db.ids.journalSales,
          date: DATE,
          lines: [
            { accountId: db.ids.accountArchived, debit: "100.00" },
            { accountId: db.ids.accountSales, credit: "100.00" },
          ],
        }),
      ),
    ).rejects.toThrow(InvalidJournalLineError);
  });

  it("throws for a journal that does not exist", async () => {
    await expect(
      db.transaction((tx) =>
        postJournalEntry(tx, { ...sale("100.00", "100.00"), journalId: "journal_missing" }),
      ),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("drafts", () => {
  it("saves a draft without touching the ledger", async () => {
    const draft = await db.transaction((tx) => createJournalEntry(tx, sale("100.00", "100.00")));

    expect(draft.status).toBe("DRAFT");
    expect((await getAccountBalance(db.client, db.ids.accountCash)).toFixed(2)).toBe("0.00");
  });

  it("posts a balanced draft", async () => {
    const draft = await db.transaction((tx) => createJournalEntry(tx, sale("100.00", "100.00")));
    const posted = await db.transaction((tx) => postDraftEntry(tx, draft.id, { userId: "u1" }));

    expect(posted.status).toBe("POSTED");
    expect((await getAccountBalance(db.client, db.ids.accountCash)).toFixed(2)).toBe("100.00");
  });

  it("refuses to post an unbalanced draft", async () => {
    const draft = await db.transaction((tx) => createJournalEntry(tx, sale("100.00", "40.00")));

    await expect(db.transaction((tx) => postDraftEntry(tx, draft.id))).rejects.toThrow(
      UnbalancedEntryError,
    );

    // The draft is still a draft; nothing reached the ledger.
    expect(db.store.journalEntry[0]?.status).toBe("DRAFT");
    expect((await getAccountBalance(db.client, db.ids.accountCash)).toFixed(2)).toBe("0.00");
  });

  it("refuses to post the same draft twice", async () => {
    const draft = await db.transaction((tx) => createJournalEntry(tx, sale("100.00", "100.00")));
    await db.transaction((tx) => postDraftEntry(tx, draft.id));

    await expect(db.transaction((tx) => postDraftEntry(tx, draft.id))).rejects.toThrow(
      InvalidStateTransitionError,
    );
  });
});

describe("period lock", () => {
  it("refuses to post into a closed period", async () => {
    const locked = createInMemoryDb({ lockDate: new Date("2026-04-30T00:00:00Z") });

    await expect(
      locked.transaction((tx) =>
        postJournalEntry(tx, {
          journalId: locked.ids.journalSales,
          date: new Date("2026-04-15T00:00:00Z"),
          lines: [
            { accountId: locked.ids.accountCash, debit: "100.00" },
            { accountId: locked.ids.accountSales, credit: "100.00" },
          ],
        }),
      ),
    ).rejects.toThrow(PeriodLockedError);

    expect(locked.store.journalEntry).toHaveLength(0);
  });

  it("allows posting after the lock date", async () => {
    const locked = createInMemoryDb({ lockDate: new Date("2026-03-31T00:00:00Z") });

    const entry = await locked.transaction((tx) =>
      postJournalEntry(tx, {
        journalId: locked.ids.journalSales,
        date: new Date("2026-04-15T00:00:00Z"),
        lines: [
          { accountId: locked.ids.accountCash, debit: "100.00" },
          { accountId: locked.ids.accountSales, credit: "100.00" },
        ],
      }),
    );

    expect(entry.status).toBe("POSTED");
  });
});

// ---------------------------------------------------------------------------
// The worked examples from the specification
// ---------------------------------------------------------------------------
describe("specification examples", () => {
  it("cash received from customer: Dr Cash, Cr Debtors", async () => {
    await db.transaction((tx) =>
      postJournalEntry(tx, {
        journalId: db.ids.journalBank,
        date: DATE,
        description: "Cash received from customer",
        lines: [
          { accountId: db.ids.accountCash, debit: "5000.00", contactId: db.ids.contact },
          { accountId: db.ids.accountDebtors, credit: "5000.00", contactId: db.ids.contact },
        ],
      }),
    );

    expect((await getAccountBalance(db.client, db.ids.accountCash)).toFixed(2)).toBe("5000.00");
    expect((await getAccountBalance(db.client, db.ids.accountDebtors)).toFixed(2)).toBe("-5000.00");
  });

  it("purchase made on credit: Dr Purchase Expense, Cr Creditors", async () => {
    await db.transaction((tx) =>
      postJournalEntry(tx, {
        journalId: db.ids.journalBank,
        date: DATE,
        description: "Purchase made on credit",
        lines: [
          { accountId: db.ids.accountPurchases, debit: "17500.00" },
          { accountId: db.ids.accountCreditors, credit: "17500.00" },
        ],
      }),
    );

    expect((await getAccountBalance(db.client, db.ids.accountPurchases)).toFixed(2)).toBe(
      "17500.00",
    );
    // A liability's natural balance is a credit, so the signed balance is negative.
    expect((await getAccountBalance(db.client, db.ids.accountCreditors)).toFixed(2)).toBe(
      "-17500.00",
    );

    const trialBalance = await getTrialBalance(db.client);
    expect(trialBalance.isBalanced).toBe(true);
  });
});
