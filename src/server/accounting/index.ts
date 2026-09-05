/**
 * Accounting core -- the only module permitted to write the ledger.
 *
 * Import from here rather than from the individual files, so the public
 * surface of the accounting engine stays explicit.
 */
export { buildEntry, checkBalance } from "./balance";
export {
  AccountingService,
  assertJournalEntryValid,
  createJournalEntry,
  getAccountBalance,
  getAccountLedger,
  postJournalEntry,
  validateJournalEntry,
} from "./accounting-service";
export type { ValidationResult } from "./accounting-service";
// NOTE: `postJournalEntry` is deliberately re-exported from ./accounting-service
// (which validates accounts first), not from ./posting-service. Nothing outside
// the accounting core should call the unvalidated posting primitive.
export {
  assertPeriodOpen,
  createDraftEntry,
  postDraftEntry,
  reverseJournalEntry,
  toAccountingDate,
} from "./posting-service";
export {
  getAccountBalances,
  getAccountStatement,
  getContactBalances,
  getOpeningBalance,
  getTrialBalance,
  naturalBalance,
} from "./ledger-service";
export type {
  AccountBalance,
  BalancedEntry,
  JournalEntryDraft,
  JournalLineDraft,
  LedgerQuery,
  NormalisedJournalLine,
  PostingContext,
} from "./types";
export type { LedgerLine } from "./ledger-service";
