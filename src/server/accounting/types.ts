import { type AccountType } from "@prisma/client";
import { type Decimal, type MoneyInput } from "@/server/money";

/**
 * A single side of a proposed journal entry. Exactly one of `debit`/`credit`
 * must be non-zero; both must be non-negative.
 */
export interface JournalLineDraft {
  accountId: string;
  debit?: MoneyInput;
  credit?: MoneyInput;
  description?: string | null;
  contactId?: string | null;
  analyticAccountId?: string | null;
}

/**
 * A proposed journal entry, before validation. Produced by document services
 * (invoice, bill, payment) and by the manual journal-entry module; consumed
 * only by the posting engine.
 */
export interface JournalEntryDraft {
  journalId: string;
  date: Date;
  reference?: string | null;
  description?: string | null;
  /** Business document that caused this entry, e.g. "CustomerInvoice". */
  sourceType?: string | null;
  sourceId?: string | null;
  lines: JournalLineDraft[];
}

/** A line after normalisation: amounts are Decimals at monetary scale. */
export interface NormalisedJournalLine {
  accountId: string;
  debit: Decimal;
  credit: Decimal;
  description: string | null;
  contactId: string | null;
  analyticAccountId: string | null;
  sequence: number;
}

/**
 * The output of `buildEntry`: a draft that has been proven balanced.
 * Only the posting engine can produce one, and it is the only thing the
 * engine will write to the database.
 */
export interface BalancedEntry {
  lines: NormalisedJournalLine[];
  totalDebit: Decimal;
  totalCredit: Decimal;
}

export interface PostingContext {
  /** User performing the posting; recorded on the entry for audit. */
  userId?: string | null;
}

/** Aggregated movement on one account, the primitive every report builds on. */
export interface AccountBalance {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  /** Total debits in the period. */
  debit: Decimal;
  /** Total credits in the period. */
  credit: Decimal;
  /** Signed balance, always `debit - credit`. */
  balance: Decimal;
}

export interface LedgerQuery {
  /** Inclusive start of the period. Omit for "since the beginning". */
  from?: Date;
  /** Inclusive end of the period. Omit for "up to today". */
  to?: Date;
  accountIds?: string[];
  analyticAccountId?: string;
  contactId?: string;
}
