/**
 * Accounting core -- the only module permitted to write the ledger.
 *
 * Import from here rather than from the individual files, so the public
 * surface of the accounting engine stays explicit.
 */
export { buildEntry, checkBalance } from "./balance";
export {
  assertPeriodOpen,
  createDraftEntry,
  postDraftEntry,
  postJournalEntry,
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
