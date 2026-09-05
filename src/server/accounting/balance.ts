import { InvalidJournalLineError, UnbalancedEntryError } from "@/server/errors";
import { isNegative, isZero, subtract, sum, toAmountString, toMoney } from "@/server/money";
import {
  type BalancedEntry,
  type JournalEntryDraft,
  type JournalLineDraft,
  type NormalisedJournalLine,
} from "./types";

/**
 * THE accounting invariant.
 *
 * `buildEntry` is a pure function -- no database, no clock, no I/O -- that
 * turns a draft into a `BalancedEntry` or throws. The posting service cannot
 * write to the ledger without a `BalancedEntry`, and this is the only place one
 * can be produced. That makes "an unbalanced entry can never be posted" a
 * property of the type system rather than a convention.
 *
 * Rules enforced:
 *   1. At least two lines.
 *   2. Every amount is non-negative.
 *   3. Every line carries a value on exactly one side (debit XOR credit).
 *   4. Total debits equal total credits, compared as exact decimals.
 *   5. The entry is not a no-op (total is non-zero).
 */
export function buildEntry(draft: JournalEntryDraft): BalancedEntry {
  const lines = normaliseLines(draft.lines);

  const totalDebit = sum(lines.map((line) => line.debit));
  const totalCredit = sum(lines.map((line) => line.credit));

  if (!totalDebit.equals(totalCredit)) {
    throw new UnbalancedEntryError(
      toAmountString(totalDebit),
      toAmountString(totalCredit),
      toAmountString(subtract(totalDebit, totalCredit)),
    );
  }

  if (isZero(totalDebit)) {
    throw new InvalidJournalLineError(
      "A journal entry must move a non-zero amount. Every line totalled zero.",
    );
  }

  return { lines, totalDebit, totalCredit };
}

/**
 * Validates whether a draft would balance, without throwing.
 * Use in UI/preview paths; use `buildEntry` on the posting path.
 */
export function checkBalance(draft: JournalEntryDraft): {
  balanced: boolean;
  totalDebit: string;
  totalCredit: string;
  difference: string;
  error?: string;
} {
  try {
    const entry = buildEntry(draft);
    return {
      balanced: true,
      totalDebit: toAmountString(entry.totalDebit),
      totalCredit: toAmountString(entry.totalCredit),
      difference: "0.00",
    };
  } catch (error) {
    const totalDebit = safeSum(draft.lines, "debit");
    const totalCredit = safeSum(draft.lines, "credit");
    return {
      balanced: false,
      totalDebit,
      totalCredit,
      difference: toAmountString(subtract(totalDebit, totalCredit)),
      error: error instanceof Error ? error.message : "Invalid journal entry.",
    };
  }
}

function normaliseLines(lines: readonly JournalLineDraft[]): NormalisedJournalLine[] {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new InvalidJournalLineError(
      `A double-entry journal entry needs at least two lines; received ${lines?.length ?? 0}.`,
    );
  }

  return lines.map((line, index) => {
    const position = index + 1;

    if (!line.accountId) {
      throw new InvalidJournalLineError(`Line ${position} has no account.`, { line: position });
    }

    const debit = toMoney(line.debit ?? 0);
    const credit = toMoney(line.credit ?? 0);

    if (isNegative(debit) || isNegative(credit)) {
      throw new InvalidJournalLineError(
        `Line ${position} has a negative amount. Use the opposite side instead of a negative value.`,
        { line: position, debit: toAmountString(debit), credit: toAmountString(credit) },
      );
    }

    if (!isZero(debit) && !isZero(credit)) {
      throw new InvalidJournalLineError(
        `Line ${position} has both a debit (${toAmountString(debit)}) and a credit (${toAmountString(credit)}). A journal line must use exactly one side.`,
        { line: position },
      );
    }

    if (isZero(debit) && isZero(credit)) {
      throw new InvalidJournalLineError(
        `Line ${position} has neither a debit nor a credit amount.`,
        { line: position },
      );
    }

    return {
      accountId: line.accountId,
      debit,
      credit,
      description: line.description ?? null,
      contactId: line.contactId ?? null,
      analyticAccountId: line.analyticAccountId ?? null,
      sequence: index,
    };
  });
}

function safeSum(lines: readonly JournalLineDraft[], side: "debit" | "credit"): string {
  try {
    return toAmountString(sum((lines ?? []).map((line) => line[side] ?? 0)));
  } catch {
    return "0.00";
  }
}
