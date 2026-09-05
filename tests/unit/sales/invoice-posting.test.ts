import { SalesOrderStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildPaymentEntry } from "@/modules/payments/payment-posting";
import { computeDocumentTotals, computeLineAmounts } from "@/modules/purchases/pricing";
import { buildCustomerInvoiceEntry } from "@/modules/sales/invoice-posting";
import { assertInvoiceable } from "@/modules/sales/sales-order-service";
import { buildEntry } from "@/server/accounting";
import { ConflictError, ValidationError } from "@/server/errors";
import { toMoney } from "@/server/money";

/**
 * Sales accounting.
 *
 * The invoice and receipt journal entries are pure functions, so the exact
 * postings can be asserted without a database. Every draft is then run through
 * `buildEntry` -- the accounting engine's gate -- to prove it would post.
 */

const ACCOUNTS = {
  debtors: "acc_debtors",
  salesIncome: "acc_sales_income",
  serviceIncome: "acc_service_income",
  taxPayable: "acc_tax_payable",
  bank: "acc_bank",
  cash: "acc_cash",
};

const DATE = new Date("2026-04-15T00:00:00Z");

function invoiceInput(lines: Parameters<typeof buildCustomerInvoiceEntry>[0]["lines"]) {
  return {
    journalId: "journal_sales",
    invoiceDate: DATE,
    invoiceNumber: "INV/00001",
    invoiceId: "invoice_1",
    customerId: "contact_nimesh",
    reference: "SO/00001",
    receivableAccountId: ACCOUNTS.debtors,
    lines,
  };
}

describe("customer invoice -> journal entry", () => {
  it("posts Dr Debtors, Cr Sales Income, Cr Tax Payable", () => {
    // The specification's example: 5 Office Chairs at 4500 + 18% GST.
    const amounts = computeLineAmounts("5", "4500.00", {
      computation: "PERCENTAGE",
      rate: "18",
    });

    const draft = buildCustomerInvoiceEntry(
      invoiceInput([
        {
          accountId: ACCOUNTS.salesIncome,
          subtotal: amounts.subtotal,
          taxAmount: amounts.taxAmount,
          taxAccountId: ACCOUNTS.taxPayable,
        },
      ]),
    );

    expect(draft.lines).toHaveLength(3);

    // Debtors is debited with the gross total.
    expect(draft.lines[0]).toMatchObject({ accountId: ACCOUNTS.debtors });
    expect(draft.lines[0]?.debit?.toString()).toBe("26550");

    // Income is credited with the net, tax with the tax.
    expect(draft.lines[1]).toMatchObject({ accountId: ACCOUNTS.salesIncome });
    expect(draft.lines[1]?.credit?.toString()).toBe("22500");
    expect(draft.lines[2]).toMatchObject({ accountId: ACCOUNTS.taxPayable });
    expect(draft.lines[2]?.credit?.toString()).toBe("4050");
  });

  it("produces an entry the accounting engine accepts", () => {
    const amounts = computeLineAmounts("5", "4500.00", {
      computation: "PERCENTAGE",
      rate: "18",
    });

    const entry = buildEntry(
      buildCustomerInvoiceEntry(
        invoiceInput([
          {
            accountId: ACCOUNTS.salesIncome,
            subtotal: amounts.subtotal,
            taxAmount: amounts.taxAmount,
            taxAccountId: ACCOUNTS.taxPayable,
          },
        ]),
      ),
    );

    expect(entry.totalDebit.equals(entry.totalCredit)).toBe(true);
    expect(entry.totalDebit.toFixed(2)).toBe("26550.00");
  });

  it("balances a tax-free invoice", () => {
    const entry = buildEntry(
      buildCustomerInvoiceEntry(
        invoiceInput([
          {
            accountId: ACCOUNTS.salesIncome,
            subtotal: toMoney("12000.00"),
            taxAmount: toMoney("0"),
            taxAccountId: null,
          },
        ]),
      ),
    );

    expect(entry.lines).toHaveLength(2);
    expect(entry.totalDebit.toFixed(2)).toBe("12000.00");
  });

  it("merges lines sharing an income account, and splits different ones", () => {
    const draft = buildCustomerInvoiceEntry(
      invoiceInput([
        {
          accountId: ACCOUNTS.salesIncome,
          subtotal: toMoney("22500.00"),
          taxAmount: toMoney("0"),
          taxAccountId: null,
        },
        {
          accountId: ACCOUNTS.salesIncome,
          subtotal: toMoney("2500.00"),
          taxAmount: toMoney("0"),
          taxAccountId: null,
        },
        {
          accountId: ACCOUNTS.serviceIncome,
          subtotal: toMoney("1500.00"),
          taxAmount: toMoney("0"),
          taxAccountId: null,
        },
      ]),
    );

    // Debtors + two income lines.
    expect(draft.lines).toHaveLength(3);
    expect(draft.lines[0]?.debit?.toString()).toBe("26500");
    expect(draft.lines[1]?.credit?.toString()).toBe("25000");
    expect(draft.lines[2]?.credit?.toString()).toBe("1500");
  });

  it("balances a multi-line invoice with mixed tax rates", () => {
    const chairs = computeLineAmounts("5", "4500.00", { computation: "PERCENTAGE", rate: "18" });
    const delivery = computeLineAmounts("1", "2000.00", { computation: "PERCENTAGE", rate: "5" });

    const entry = buildEntry(
      buildCustomerInvoiceEntry(
        invoiceInput([
          {
            accountId: ACCOUNTS.salesIncome,
            subtotal: chairs.subtotal,
            taxAmount: chairs.taxAmount,
            taxAccountId: ACCOUNTS.taxPayable,
          },
          {
            accountId: ACCOUNTS.serviceIncome,
            subtotal: delivery.subtotal,
            taxAmount: delivery.taxAmount,
            taxAccountId: ACCOUNTS.taxPayable,
          },
        ]),
      ),
    );

    // 22500 + 2000 net, 4050 + 100 tax = 28650
    expect(entry.totalDebit.toFixed(2)).toBe("28650.00");
    expect(entry.totalDebit.equals(entry.totalCredit)).toBe(true);
  });

  it("tags every line with the customer, for the partner ledger", () => {
    const draft = buildCustomerInvoiceEntry(
      invoiceInput([
        {
          accountId: ACCOUNTS.salesIncome,
          subtotal: toMoney("1000.00"),
          taxAmount: toMoney("180.00"),
          taxAccountId: ACCOUNTS.taxPayable,
        },
      ]),
    );

    expect(draft.lines.every((line) => line.contactId === "contact_nimesh")).toBe(true);
  });

  it("links the entry back to the invoice for the audit trail", () => {
    const draft = buildCustomerInvoiceEntry(
      invoiceInput([
        {
          accountId: ACCOUNTS.salesIncome,
          subtotal: toMoney("100.00"),
          taxAmount: toMoney("0"),
          taxAccountId: null,
        },
      ]),
    );

    expect(draft).toMatchObject({
      sourceType: "CustomerInvoice",
      sourceId: "invoice_1",
      reference: "SO/00001",
    });
  });

  it("carries the analytic account onto the income line", () => {
    const draft = buildCustomerInvoiceEntry(
      invoiceInput([
        {
          accountId: ACCOUNTS.salesIncome,
          subtotal: toMoney("1000.00"),
          taxAmount: toMoney("0"),
          taxAccountId: null,
          analyticAccountId: "analytic_retail",
        },
      ]),
    );

    expect(draft.lines[1]?.analyticAccountId).toBe("analytic_retail");
  });

  it("refuses an invoice with no lines", () => {
    expect(() => buildCustomerInvoiceEntry(invoiceInput([]))).toThrow(ValidationError);
  });

  it("refuses a zero-total invoice", () => {
    expect(() =>
      buildCustomerInvoiceEntry(
        invoiceInput([
          {
            accountId: ACCOUNTS.salesIncome,
            subtotal: toMoney("0"),
            taxAmount: toMoney("0"),
            taxAccountId: null,
          },
        ]),
      ),
    ).toThrow(ValidationError);
  });

  it("is the mirror image of a vendor bill", () => {
    // A sale credits income and debits the receivable; a purchase does the
    // opposite. Both must balance.
    const entry = buildEntry(
      buildCustomerInvoiceEntry(
        invoiceInput([
          {
            accountId: ACCOUNTS.salesIncome,
            subtotal: toMoney("1000.00"),
            taxAmount: toMoney("0"),
            taxAccountId: null,
          },
        ]),
      ),
    );

    const debtors = entry.lines.find((line) => line.accountId === ACCOUNTS.debtors);
    const income = entry.lines.find((line) => line.accountId === ACCOUNTS.salesIncome);

    expect(debtors?.credit.isZero()).toBe(true);
    expect(income?.debit.isZero()).toBe(true);
  });
});

describe("customer receipt -> journal entry", () => {
  const base = {
    journalId: "journal_cash",
    paymentNumber: "RCPT/00001",
    paymentId: "payment_1",
    paymentDate: DATE,
    contactId: "contact_nimesh",
    counterpartAccountId: ACCOUNTS.debtors,
  };

  it("inbound by cash: Dr Cash, Cr Debtors", () => {
    const draft = buildPaymentEntry({
      ...base,
      paymentAccountId: ACCOUNTS.cash,
      direction: "INBOUND",
      amount: toMoney("26550.00"),
    });

    expect(draft.lines[0]).toMatchObject({ accountId: ACCOUNTS.cash });
    expect(draft.lines[0]?.debit?.toString()).toBe("26550");
    expect(draft.lines[1]).toMatchObject({ accountId: ACCOUNTS.debtors });
    expect(draft.lines[1]?.credit?.toString()).toBe("26550");

    expect(buildEntry(draft).totalDebit.equals(buildEntry(draft).totalCredit)).toBe(true);
  });

  it("inbound by bank: Dr Bank, Cr Debtors", () => {
    const draft = buildPaymentEntry({
      ...base,
      paymentAccountId: ACCOUNTS.bank,
      direction: "INBOUND",
      amount: toMoney("10000.00"),
    });

    expect(draft.lines[0]).toMatchObject({ accountId: ACCOUNTS.bank });
    expect(buildEntry(draft).totalDebit.toFixed(2)).toBe("10000.00");
  });
});

describe("assertInvoiceable", () => {
  it("allows a confirmed order", () => {
    expect(() =>
      assertInvoiceable({ number: "SO/00001", status: SalesOrderStatus.CONFIRMED }),
    ).not.toThrow();
  });

  it("refuses a draft order", () => {
    expect(() =>
      assertInvoiceable({ number: "SO/00001", status: SalesOrderStatus.DRAFT }),
    ).toThrow(ConflictError);
  });

  it("refuses a duplicate invoice for an already-invoiced order", () => {
    expect(() =>
      assertInvoiceable({ number: "SO/00001", status: SalesOrderStatus.INVOICED }),
    ).toThrow(/already been invoiced/);
  });

  it("refuses a cancelled order", () => {
    expect(() =>
      assertInvoiceable({ number: "SO/00001", status: SalesOrderStatus.CANCELLED }),
    ).toThrow(ConflictError);
  });
});

describe("the specification's sales walkthrough", () => {
  it("5 Office Chairs for Nimesh Pathak: order -> invoice -> payment", () => {
    // 1. Sales order: 5 Office Chairs at 4500 + 18% GST.
    const line = computeLineAmounts("5", "4500.00", { computation: "PERCENTAGE", rate: "18" });
    const totals = computeDocumentTotals([line]);

    expect(totals.amountUntaxed.toFixed(2)).toBe("22500.00");
    expect(totals.amountTax.toFixed(2)).toBe("4050.00");
    expect(totals.amountTotal.toFixed(2)).toBe("26550.00");

    // 2. Invoice posting.
    const invoiceEntry = buildEntry(
      buildCustomerInvoiceEntry(
        invoiceInput([
          {
            accountId: ACCOUNTS.salesIncome,
            subtotal: line.subtotal,
            taxAmount: line.taxAmount,
            taxAccountId: ACCOUNTS.taxPayable,
          },
        ]),
      ),
    );

    // 3. Payment received through the bank, in full.
    const paymentEntry = buildEntry(
      buildPaymentEntry({
        journalId: "journal_bank",
        paymentNumber: "RCPT/00001",
        paymentId: "payment_1",
        paymentDate: new Date("2026-04-20T00:00:00Z"),
        direction: "INBOUND",
        amount: totals.amountTotal,
        contactId: "contact_nimesh",
        paymentAccountId: ACCOUNTS.bank,
        counterpartAccountId: ACCOUNTS.debtors,
      }),
    );

    expect(invoiceEntry.totalDebit.equals(invoiceEntry.totalCredit)).toBe(true);
    expect(paymentEntry.totalDebit.equals(paymentEntry.totalCredit)).toBe(true);

    // The customer's outstanding balance returns to zero.
    const debtorMovement = [...invoiceEntry.lines, ...paymentEntry.lines]
      .filter((entryLine) => entryLine.accountId === ACCOUNTS.debtors)
      .reduce((balance, entryLine) => balance.plus(entryLine.debit).minus(entryLine.credit), toMoney("0"));

    expect(debtorMovement.toFixed(2)).toBe("0.00");

    // Cash is up by the gross, income by the net, tax payable by the tax.
    const bankMovement = paymentEntry.lines
      .filter((entryLine) => entryLine.accountId === ACCOUNTS.bank)
      .reduce((balance, entryLine) => balance.plus(entryLine.debit).minus(entryLine.credit), toMoney("0"));

    expect(bankMovement.toFixed(2)).toBe("26550.00");
  });

  it("a partial payment leaves the customer still owing the remainder", () => {
    const total = toMoney("26550.00");
    const paid = toMoney("10000.00");

    const invoiceEntry = buildEntry(
      buildCustomerInvoiceEntry(
        invoiceInput([
          {
            accountId: ACCOUNTS.salesIncome,
            subtotal: toMoney("22500.00"),
            taxAmount: toMoney("4050.00"),
            taxAccountId: ACCOUNTS.taxPayable,
          },
        ]),
      ),
    );

    const paymentEntry = buildEntry(
      buildPaymentEntry({
        journalId: "journal_bank",
        paymentNumber: "RCPT/00002",
        paymentId: "payment_2",
        paymentDate: DATE,
        direction: "INBOUND",
        amount: paid,
        contactId: "contact_nimesh",
        paymentAccountId: ACCOUNTS.bank,
        counterpartAccountId: ACCOUNTS.debtors,
      }),
    );

    const debtorBalance = [...invoiceEntry.lines, ...paymentEntry.lines]
      .filter((entryLine) => entryLine.accountId === ACCOUNTS.debtors)
      .reduce((balance, entryLine) => balance.plus(entryLine.debit).minus(entryLine.credit), toMoney("0"));

    expect(debtorBalance.toFixed(2)).toBe(total.minus(paid).toFixed(2));
    expect(debtorBalance.toFixed(2)).toBe("16550.00");
  });
});
