-- Budget lifecycle gains two states: REVISED and CANCELLED.
--
--   DRAFT      -> editable, can be confirmed or cancelled
--   CONFIRMED  -> financial values locked, can be revised or cancelled
--   REVISED    -> superseded by a newer revision (read-only)
--   CANCELLED  -> read-only
--   CLOSED     -> period ended (read-only)
--
-- Added in place rather than recreating the type, so existing budget rows keep
-- their status. PostgreSQL 12+ allows ADD VALUE inside a transaction as long as
-- the new value is not used in that same transaction.

ALTER TYPE "BudgetStatus" ADD VALUE IF NOT EXISTS 'REVISED' BEFORE 'CLOSED';
ALTER TYPE "BudgetStatus" ADD VALUE IF NOT EXISTS 'CANCELLED' BEFORE 'CLOSED';
