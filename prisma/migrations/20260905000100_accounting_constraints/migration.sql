-- ===========================================================================
-- Urban Furniture - accounting integrity constraints
-- ===========================================================================
-- These guarantees are enforced by PostgreSQL itself, so they hold even if the
-- application is bypassed (psql, a migration script, a future service, a bug).
--
--   1. A journal item carries a value on exactly one side, never negative.
--   2. A POSTED journal entry is balanced: sum(debit) = sum(credit), the item
--      sums match the entry's control totals, and it has at least two items.
--      Checked with a DEFERRED constraint trigger, so it is evaluated at COMMIT
--      and cannot be defeated by the order of INSERTs inside a transaction.
--   3. A POSTED journal entry and its items can never be updated or deleted.
--      Corrections are made by posting a reversal entry.
--   4. A payment allocation targets exactly one document.
--   5. Amounts that cannot be negative, are not.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Journal item: one side only, never negative
-- ---------------------------------------------------------------------------
ALTER TABLE "journal_items"
  ADD CONSTRAINT "journal_items_amounts_non_negative"
  CHECK ("debit" >= 0 AND "credit" >= 0);

ALTER TABLE "journal_items"
  ADD CONSTRAINT "journal_items_one_side_only"
  CHECK (NOT ("debit" > 0 AND "credit" > 0));

-- ---------------------------------------------------------------------------
-- 2. Journal entry: control totals must agree while POSTED
-- ---------------------------------------------------------------------------
ALTER TABLE "journal_entries"
  ADD CONSTRAINT "journal_entries_totals_non_negative"
  CHECK ("totalDebit" >= 0 AND "totalCredit" >= 0);

ALTER TABLE "journal_entries"
  ADD CONSTRAINT "journal_entries_balanced_when_posted"
  CHECK ("status" <> 'POSTED' OR "totalDebit" = "totalCredit");

-- Deferred verification of the entry against its actual items.
CREATE OR REPLACE FUNCTION "assert_entry_balanced"(p_entry_id TEXT)
RETURNS VOID AS $$
DECLARE
  v_status       "EntryStatus";
  v_total_debit  NUMERIC(18,2);
  v_total_credit NUMERIC(18,2);
  v_sum_debit    NUMERIC(18,2);
  v_sum_credit   NUMERIC(18,2);
  v_item_count   INTEGER;
BEGIN
  SELECT "status", "totalDebit", "totalCredit"
    INTO v_status, v_total_debit, v_total_credit
    FROM "journal_entries"
   WHERE "id" = p_entry_id;

  -- Entry removed within the same transaction: nothing to verify.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Draft and cancelled entries are work in progress and may be unbalanced.
  IF v_status <> 'POSTED' THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM("debit"), 0), COALESCE(SUM("credit"), 0), COUNT(*)
    INTO v_sum_debit, v_sum_credit, v_item_count
    FROM "journal_items"
   WHERE "journalEntryId" = p_entry_id;

  IF v_item_count < 2 THEN
    RAISE EXCEPTION
      'Posted journal entry % must have at least two items (found %).',
      p_entry_id, v_item_count
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_sum_debit <> v_sum_credit THEN
    RAISE EXCEPTION
      'Unbalanced journal entry %: debits % do not equal credits %.',
      p_entry_id, v_sum_debit, v_sum_credit
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_sum_debit = 0 THEN
    RAISE EXCEPTION
      'Posted journal entry % has a zero total.', p_entry_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_sum_debit <> v_total_debit OR v_sum_credit <> v_total_credit THEN
    RAISE EXCEPTION
      'Journal entry % control totals (debit %, credit %) do not match its items (debit %, credit %).',
      p_entry_id, v_total_debit, v_total_credit, v_sum_debit, v_sum_credit
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "trg_assert_entry_balanced_from_entry"()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM "assert_entry_balanced"(NEW."id");
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "trg_assert_entry_balanced_from_item"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM "assert_entry_balanced"(OLD."journalEntryId");
  ELSE
    PERFORM "assert_entry_balanced"(NEW."journalEntryId");
    IF TG_OP = 'UPDATE' AND OLD."journalEntryId" <> NEW."journalEntryId" THEN
      PERFORM "assert_entry_balanced"(OLD."journalEntryId");
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "journal_entries_balance_check"
  AFTER INSERT OR UPDATE ON "journal_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "trg_assert_entry_balanced_from_entry"();

CREATE CONSTRAINT TRIGGER "journal_items_balance_check"
  AFTER INSERT OR UPDATE OR DELETE ON "journal_items"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "trg_assert_entry_balanced_from_item"();

-- ---------------------------------------------------------------------------
-- 3. Posted entries are immutable
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "trg_journal_entry_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'POSTED' THEN
      RAISE EXCEPTION
        'Journal entry % is posted and cannot be deleted. Post a reversal entry instead.',
        OLD."number"
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" = 'POSTED' THEN
    RAISE EXCEPTION
      'Journal entry % is posted and cannot be modified. Post a reversal entry instead.',
      OLD."number"
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "trg_journal_item_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'POSTED' THEN
      RAISE EXCEPTION
        'Journal item % belongs to a posted entry and cannot be deleted.', OLD."id"
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" = 'POSTED' THEN
    RAISE EXCEPTION
      'Journal item % belongs to a posted entry and cannot be modified.', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "journal_entries_immutable"
  BEFORE UPDATE OR DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION "trg_journal_entry_immutable"();

CREATE TRIGGER "journal_items_immutable"
  BEFORE UPDATE OR DELETE ON "journal_items"
  FOR EACH ROW EXECUTE FUNCTION "trg_journal_item_immutable"();

-- ---------------------------------------------------------------------------
-- 4. A payment allocation settles exactly one document
-- ---------------------------------------------------------------------------
ALTER TABLE "payment_allocations"
  ADD CONSTRAINT "payment_allocations_exactly_one_target"
  CHECK (
    ("vendorBillId" IS NOT NULL AND "customerInvoiceId" IS NULL)
    OR
    ("vendorBillId" IS NULL AND "customerInvoiceId" IS NOT NULL)
  );

ALTER TABLE "payment_allocations"
  ADD CONSTRAINT "payment_allocations_amount_positive"
  CHECK ("amount" > 0);

-- ---------------------------------------------------------------------------
-- 5. Document amounts and quantities
-- ---------------------------------------------------------------------------
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive"
  CHECK ("amount" > 0 AND "amountUnallocated" >= 0 AND "amountUnallocated" <= "amount");

ALTER TABLE "vendor_bills"
  ADD CONSTRAINT "vendor_bills_amounts_valid"
  CHECK (
    "amountTotal" >= 0 AND "amountPaid" >= 0 AND "amountResidual" >= 0
    AND "amountPaid" <= "amountTotal"
  );

ALTER TABLE "customer_invoices"
  ADD CONSTRAINT "customer_invoices_amounts_valid"
  CHECK (
    "amountTotal" >= 0 AND "amountPaid" >= 0 AND "amountResidual" >= 0
    AND "amountPaid" <= "amountTotal"
  );

ALTER TABLE "purchase_order_lines"
  ADD CONSTRAINT "purchase_order_lines_quantity_positive"
  CHECK ("quantity" > 0 AND "quantityBilled" >= 0);

ALTER TABLE "sales_order_lines"
  ADD CONSTRAINT "sales_order_lines_quantity_positive"
  CHECK ("quantity" > 0 AND "quantityInvoiced" >= 0);

ALTER TABLE "vendor_bill_lines"
  ADD CONSTRAINT "vendor_bill_lines_quantity_positive"
  CHECK ("quantity" > 0);

ALTER TABLE "customer_invoice_lines"
  ADD CONSTRAINT "customer_invoice_lines_quantity_positive"
  CHECK ("quantity" > 0);

ALTER TABLE "stock_moves"
  ADD CONSTRAINT "stock_moves_quantity_positive"
  CHECK ("quantity" > 0);

-- ---------------------------------------------------------------------------
-- 6. Periods and sequences
-- ---------------------------------------------------------------------------
ALTER TABLE "budgets"
  ADD CONSTRAINT "budgets_period_valid"
  CHECK ("periodEnd" >= "periodStart");

ALTER TABLE "budget_lines"
  ADD CONSTRAINT "budget_lines_planned_non_negative"
  CHECK ("plannedAmount" >= 0 AND "committedAmount" >= 0 AND "achievedAmount" >= 0);

ALTER TABLE "sequences"
  ADD CONSTRAINT "sequences_next_value_positive"
  CHECK ("nextValue" >= 1 AND "padding" >= 0 AND "padding" <= 12);

ALTER TABLE "company_settings"
  ADD CONSTRAINT "company_settings_fiscal_month_valid"
  CHECK ("fiscalYearStartMonth" BETWEEN 1 AND 12);

-- ---------------------------------------------------------------------------
-- 7. A budget line may only appear once per (budget, analytic account) when no
--    ledger account is set. The Prisma @@unique treats NULL accountId rows as
--    distinct, so add an explicit partial unique index.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "budget_lines_budget_analytic_no_account_key"
  ON "budget_lines" ("budgetId", "analyticAccountId")
  WHERE "accountId" IS NULL;
