import { describe, expect, it } from "vitest";
import { buildEntry, checkBalance } from "@/server/accounting/balance";
import { type JournalEntryDraft } from "@/server/accounting/types";
import { InvalidJournalLineError, UnbalancedEntryError } from "@/server/errors";

/**
 * The canonical accounting test.
 *
 * If any of these fail, the system can write an unbalanced ledger and nothing
 * else in the application can be trusted.
 */

function draft(lines: JournalEntryDraft["lines"]): JournalEntryDraft {
  return { journalId: "journal_sales", date: new Date("2026-04-15T00:00:00Z"), lines };
}

describe("buildEntry - double-entry enforcement", () => {
  it("accepts a balanced two-line entry", () => {
    const entry = buildEntry(
      draft([
        { accountId: "acc_debtors", debit: "5900.00" },
        { accountId: "acc_sales", credit: "5900.00" },
      ]),
    );

    expect(entry.totalDebit.toFixed(2)).toBe("5900.00");
    expect(entry.totalCredit.toFixed(2)).toBe("5900.00");
    expect(entry.lines).toHaveLength(2);
    expect(entry.lines.map((l) => l.sequence)).toEqual([0, 1]);
  });

  it("accepts a balanced multi-line invoice entry (net + tax)", () => {
    const entry = buildEntry(
      draft([
        { accountId: "acc_debtors", debit: "26550.00" },
        { accountId: "acc_sales", credit: "22500.00" },
        { accountId: "acc_tax_payable", credit: "4050.00" },
      ]),
    );

    expect(entry.totalDebit.equals(entry.totalCredit)).toBe(true);
    expect(entry.totalDebit.toFixed(2)).toBe("26550.00");
  });

  it("REJECTS an unbalanced entry", () => {
    expect(() =>
      buildEntry(
        draft([
          { accountId: "acc_debtors", debit: "5900.00" },
          { accountId: "acc_sales", credit: "5000.00" },
        ]),
      ),
    ).toThrow(UnbalancedEntryError);
  });

  it("reports the exact difference on an unbalanced entry", () => {
    try {
      buildEntry(
        draft([
          { accountId: "acc_debtors", debit: "1000.00" },
          { accountId: "acc_sales", credit: "999.99" },
        ]),
      );
      expect.unreachable("an unbalanced entry must not build");
    } catch (error) {
      expect(error).toBeInstanceOf(UnbalancedEntryError);
      expect((error as UnbalancedEntryError).details).toEqual({
        totalDebit: "1000.00",
        totalCredit: "999.99",
        difference: "0.01",
      });
    }
  });

  it("REJECTS an entry that is off by the smallest representable amount", () => {
    expect(() =>
      buildEntry(
        draft([
          { accountId: "a", debit: "0.02" },
          { accountId: "b", credit: "0.01" },
        ]),
      ),
    ).toThrow(UnbalancedEntryError);
  });

  it("REJECTS a line carrying both a debit and a credit", () => {
    expect(() =>
      buildEntry(
        draft([
          { accountId: "a", debit: "100.00", credit: "100.00" },
          { accountId: "b", credit: "100.00" },
        ]),
      ),
    ).toThrow(InvalidJournalLineError);
  });

  it("REJECTS negative amounts", () => {
    expect(() =>
      buildEntry(
        draft([
          { accountId: "a", debit: "-100.00" },
          { accountId: "b", credit: "-100.00" },
        ]),
      ),
    ).toThrow(InvalidJournalLineError);
  });

  it("REJECTS an entry with fewer than two lines", () => {
    expect(() => buildEntry(draft([{ accountId: "a", debit: "100.00" }]))).toThrow(
      InvalidJournalLineError,
    );
    expect(() => buildEntry(draft([]))).toThrow(InvalidJournalLineError);
  });

  it("REJECTS a line with neither debit nor credit", () => {
    expect(() =>
      buildEntry(
        draft([
          { accountId: "a", debit: "100.00" },
          { accountId: "b", credit: "100.00" },
          { accountId: "c" },
        ]),
      ),
    ).toThrow(InvalidJournalLineError);
  });

  it("REJECTS a line with no account", () => {
    expect(() =>
      buildEntry(
        draft([
          { accountId: "", debit: "100.00" },
          { accountId: "b", credit: "100.00" },
        ]),
      ),
    ).toThrow(InvalidJournalLineError);
  });

  it("REJECTS a zero-total entry", () => {
    expect(() =>
      buildEntry(
        draft([
          { accountId: "a", debit: "0" },
          { accountId: "b", credit: "0" },
        ]),
      ),
    ).toThrow(InvalidJournalLineError);
  });

  it("balances amounts that would drift under floating-point arithmetic", () => {
    // 0.1 + 0.2 !== 0.3 as IEEE-754 doubles; as decimals it is exact.
    const entry = buildEntry(
      draft([
        { accountId: "a", debit: "0.10" },
        { accountId: "a2", debit: "0.20" },
        { accountId: "b", credit: "0.30" },
      ]),
    );

    expect(entry.totalDebit.toFixed(2)).toBe("0.30");
    expect(entry.totalDebit.equals(entry.totalCredit)).toBe(true);
  });

  it("preserves analytic account and contact tags on each line", () => {
    const entry = buildEntry(
      draft([
        { accountId: "a", debit: "500.00", contactId: "c1", analyticAccountId: "aa1" },
        { accountId: "b", credit: "500.00", description: "Sale" },
      ]),
    );

    expect(entry.lines[0]).toMatchObject({ contactId: "c1", analyticAccountId: "aa1" });
    expect(entry.lines[1]).toMatchObject({ description: "Sale", contactId: null });
  });
});

describe("checkBalance - non-throwing preview", () => {
  it("reports a balanced draft", () => {
    const result = checkBalance(
      draft([
        { accountId: "a", debit: "100.00" },
        { accountId: "b", credit: "100.00" },
      ]),
    );

    expect(result).toMatchObject({ balanced: true, difference: "0.00" });
  });

  it("reports the difference on an unbalanced draft without throwing", () => {
    const result = checkBalance(
      draft([
        { accountId: "a", debit: "100.00" },
        { accountId: "b", credit: "60.00" },
      ]),
    );

    expect(result.balanced).toBe(false);
    expect(result.difference).toBe("40.00");
    expect(result.error).toContain("not balanced");
  });
});
