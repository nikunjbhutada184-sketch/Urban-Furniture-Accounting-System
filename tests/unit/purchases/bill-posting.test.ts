import { PurchaseOrderStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildPaymentEntry } from "@/modules/payments/payment-posting";
import { buildVendorBillEntry } from "@/modules/purchases/bill-posting";
import { computeLineAmounts } from "@/modules/purchases/pricing";
import { assertBillable } from "@/modules/purchases/purchase-order-service";
import { buildEntry } from "@/server/accounting";
import { ConflictError, ValidationError } from "@/server/errors";
import { toMoney } from "@/server/money";

/**
 * Purchase accounting.
 *
 * The bill and payment journal entries are built by pure functions, so the
 * exact debits and credits the specification requires can be asserted without
 * a database. Every draft is then fed through `buildEntry` -- the accounting
 * engine's gate -- to prove it would actually post.
 */

const ACCOUNTS = {
  purchases: "acc_purchases",
  freight: "acc_freight",
  inputTax: "acc_input_tax",
  creditors: "acc_creditors",
  bank: "acc_bank",
  cash: "acc_cash",
};

const DATE = new Date("2026-04-15T00:00:00Z");

function billInput(lines: Parameters<typeof buildVendorBillEntry>[0]["lines"]) {
  return {
    journalId: "journal_purchase",
    invoiceDate: DATE,
    billNumber: "BILL/00001",
    billId: "bill_1",
    vendorId: "contact_azure",
    vendorReference: "AZ-9912",
    payableAccountId: ACCOUNTS.creditors,
    lines,
  };
}

describe("vendor bill -> journal entry", () => {
  it("posts Dr Purchases Expense, Dr Input Tax, Cr Creditors", () => {
    const amounts = computeLineAmounts("5", "3000.00", {
      computation: "PERCENTAGE",
      rate: "18",
    });

    const draft = buildVendorBillEntry(
      billInput([
        {
          accountId: ACCOUNTS.purchases,
          subtotal: amounts.subtotal,
          taxAmount: amounts.taxAmount,
          taxAccountId: ACCOUNTS.inputTax,
        },
      ]),
    );

    expect(draft.lines).toHaveLength(3);
    expect(draft.lines[0]).toMatchObject({ accountId: ACCOUNTS.purchases });
    expect(draft.lines[0]?.debit?.toString()).toBe("15000");
    expect(draft.lines[1]).toMatchObject({ accountId: ACCOUNTS.inputTax });
    expect(draft.lines[1]?.debit?.toString()).toBe("2700");
    expect(draft.lines[2]).toMatchObject({ accountId: ACCOUNTS.creditors });
    expect(draft.lines[2]?.credit?.toString()).toBe("17700");
  });

  it("produces an entry the accounting engine accepts", () => {
    const amounts = computeLineAmounts("5", "3000.00", {
      computation: "PERCENTAGE",
      rate: "18",
    });

    const entry = buildEntry(
      buildVendorBillEntry(
        billInput([
          {
            accountId: ACCOUNTS.purchases,
            subtotal: amounts.subtotal,
            taxAmount: amounts.taxAmount,
            taxAccountId: ACCOUNTS.inputTax,
          },
        ]),
      ),
    );

    expect(entry.totalDebit.equals(entry.totalCredit)).toBe(true);
    expect(entry.totalDebit.toFixed(2)).toBe("17700.00");
  });

  it("balances a tax-free bill", () => {
    const entry = buildEntry(
      buildVendorBillEntry(
        billInput([
          {
            accountId: ACCOUNTS.purchases,
            subtotal: toMoney("8000.00"),
            taxAmount: toMoney("0"),
            taxAccountId: null,
          },
        ]),
      ),
    );

    expect(entry.lines).toHaveLength(2);
    expect(entry.totalDebit.toFixed(2)).toBe("8000.00");
  });

  it("merges lines that share an expense account into one journal line", () => {
    const draft = buildVendorBillEntry(
      billInput([
        {
          accountId: ACCOUNTS.purchases,
          subtotal: toMoney("1000.00"),
          taxAmount: toMoney("0"),
          taxAccountId: null,
        },
        {
          accountId: ACCOUNTS.purchases,
          subtotal: toMoney("500.00"),
          taxAmount: toMoney("0"),
          taxAccountId: null,
        },
        {
          accountId: ACCOUNTS.freight,
          subtotal: toMoney("250.00"),
          taxAmount: toMoney("0"),
          taxAccountId: null,
        },
      ]),
    );

    // Two expense lines + one payable line.
    expect(draft.lines).toHaveLength(3);
    expect(draft.lines[0]?.debit?.toString()).toBe("1500");
    expect(draft.lines[1]?.debit?.toString()).toBe("250");
    expect(draft.lines[2]?.credit?.toString()).toBe("1750");
  });

  it("balances a multi-line bill with mixed tax rates", () => {
    const chairs = computeLineAmounts("5", "3000.00", { computation: "PERCENTAGE", rate: "18" });
    const service = computeLineAmounts("1", "1200.00", { computation: "PERCENTAGE", rate: "5" });

    const entry = buildEntry(
      buildVendorBillEntry(
        billInput([
          {
            accountId: ACCOUNTS.purchases,
            subtotal: chairs.subtotal,
            taxAmount: chairs.taxAmount,
            taxAccountId: ACCOUNTS.inputTax,
          },
          {
            accountId: ACCOUNTS.freight,
            subtotal: service.subtotal,
            taxAmount: service.taxAmount,
            taxAccountId: ACCOUNTS.inputTax,
          },
        ]),
      ),
    );

    // 15000 + 1200 + (2700 + 60) tax = 18960
    expect(entry.totalDebit.toFixed(2)).toBe("18960.00");
    expect(entry.totalDebit.equals(entry.totalCredit)).toBe(true);
  });

  it("carries the analytic account onto the expense line", () => {
    const draft = buildVendorBillEntry(
      billInput([
        {
          accountId: ACCOUNTS.purchases,
          subtotal: toMoney("1000.00"),
          taxAmount: toMoney("0"),
          taxAccountId: null,
          analyticAccountId: "analytic_logistics",
        },
      ]),
    );

    expect(draft.lines[0]?.analyticAccountId).toBe("analytic_logistics");
  });

  it("tags every line with the vendor, for the partner ledger", () => {
    const draft = buildVendorBillEntry(
      billInput([
        {
          accountId: ACCOUNTS.purchases,
          subtotal: toMoney("1000.00"),
          taxAmount: toMoney("180.00"),
          taxAccountId: ACCOUNTS.inputTax,
        },
      ]),
    );

    expect(draft.lines.every((line) => line.contactId === "contact_azure")).toBe(true);
  });

  it("links the entry back to the bill for the audit trail", () => {
    const draft = buildVendorBillEntry(
      billInput([
        {
          accountId: ACCOUNTS.purchases,
          subtotal: toMoney("100.00"),
          taxAmount: toMoney("0"),
          taxAccountId: null,
        },
      ]),
    );

    expect(draft).toMatchObject({
      sourceType: "VendorBill",
      sourceId: "bill_1",
      reference: "AZ-9912",
    });
  });

  it("refuses a bill with no lines", () => {
    expect(() => buildVendorBillEntry(billInput([]))).toThrow(ValidationError);
  });

  it("refuses a zero-total bill", () => {
    expect(() =>
      buildVendorBillEntry(
        billInput([
          {
            accountId: ACCOUNTS.purchases,
            subtotal: toMoney("0"),
            taxAmount: toMoney("0"),
            taxAccountId: null,
          },
        ]),
      ),
    ).toThrow(ValidationError);
  });
});

describe("payment -> journal entry", () => {
  const base = {
    journalId: "journal_bank",
    paymentNumber: "PAY/00001",
    paymentId: "payment_1",
    paymentDate: DATE,
    contactId: "contact_azure",
    paymentAccountId: ACCOUNTS.bank,
    counterpartAccountId: ACCOUNTS.creditors,
  };

  it("outbound: Dr Creditors, Cr Bank", () => {
    const draft = buildPaymentEntry({
      ...base,
      direction: "OUTBOUND",
      amount: toMoney("17700.00"),
    });

    expect(draft.lines[0]).toMatchObject({ accountId: ACCOUNTS.creditors });
    expect(draft.lines[0]?.debit?.toString()).toBe("17700");
    expect(draft.lines[1]).toMatchObject({ accountId: ACCOUNTS.bank });
    expect(draft.lines[1]?.credit?.toString()).toBe("17700");

    const entry = buildEntry(draft);
    expect(entry.totalDebit.equals(entry.totalCredit)).toBe(true);
  });

  it("inbound: Dr Cash, Cr Debtors", () => {
    const draft = buildPaymentEntry({
      ...base,
      paymentAccountId: ACCOUNTS.cash,
      counterpartAccountId: "acc_debtors",
      direction: "INBOUND",
      amount: toMoney("5000.00"),
    });

    expect(draft.lines[0]).toMatchObject({ accountId: ACCOUNTS.cash });
    expect(draft.lines[0]?.debit?.toString()).toBe("5000");
    expect(draft.lines[1]).toMatchObject({ accountId: "acc_debtors" });
    expect(draft.lines[1]?.credit?.toString()).toBe("5000");

    expect(buildEntry(draft).totalDebit.toFixed(2)).toBe("5000.00");
  });

  it("refuses a zero or negative payment", () => {
    expect(() =>
      buildPaymentEntry({ ...base, direction: "OUTBOUND", amount: toMoney("0") }),
    ).toThrow(ValidationError);

    expect(() =>
      buildPaymentEntry({ ...base, direction: "OUTBOUND", amount: toMoney("-100") }),
    ).toThrow(ValidationError);
  });

  it("refuses a payment where both sides are the same account", () => {
    expect(() =>
      buildPaymentEntry({
        ...base,
        counterpartAccountId: ACCOUNTS.bank,
        direction: "OUTBOUND",
        amount: toMoney("100.00"),
      }),
    ).toThrow(ValidationError);
  });

  it("links the entry back to the payment", () => {
    const draft = buildPaymentEntry({
      ...base,
      direction: "OUTBOUND",
      amount: toMoney("100.00"),
    });

    expect(draft).toMatchObject({ sourceType: "Payment", sourceId: "payment_1" });
  });
});

describe("assertBillable", () => {
  it("allows a confirmed order", () => {
    expect(() =>
      assertBillable({ number: "PO/00001", status: PurchaseOrderStatus.CONFIRMED }),
    ).not.toThrow();
  });

  it("refuses a draft order", () => {
    expect(() =>
      assertBillable({ number: "PO/00001", status: PurchaseOrderStatus.DRAFT }),
    ).toThrow(ConflictError);
  });

  it("refuses an order that has already been billed", () => {
    expect(() =>
      assertBillable({ number: "PO/00001", status: PurchaseOrderStatus.BILLED }),
    ).toThrow(/already been billed/);
  });

  it("refuses a cancelled order", () => {
    expect(() =>
      assertBillable({ number: "PO/00001", status: PurchaseOrderStatus.CANCELLED }),
    ).toThrow(ConflictError);
  });
});

describe("the specification's purchase walkthrough", () => {
  it("PO -> bill -> payment leaves a balanced ledger and a settled vendor", () => {
    // 5 Office Chairs at 3000 + 18% GST, from Azure Furniture.
    const amounts = computeLineAmounts("5", "3000.00", {
      computation: "PERCENTAGE",
      rate: "18",
    });

    const billEntry = buildEntry(
      buildVendorBillEntry(
        billInput([
          {
            accountId: ACCOUNTS.purchases,
            subtotal: amounts.subtotal,
            taxAmount: amounts.taxAmount,
            taxAccountId: ACCOUNTS.inputTax,
          },
        ]),
      ),
    );

    const paymentEntry = buildEntry(
      buildPaymentEntry({
        journalId: "journal_bank",
        paymentNumber: "PAY/00001",
        paymentId: "payment_1",
        paymentDate: new Date("2026-04-20T00:00:00Z"),
        direction: "OUTBOUND",
        amount: amounts.total,
        contactId: "contact_azure",
        paymentAccountId: ACCOUNTS.bank,
        counterpartAccountId: ACCOUNTS.creditors,
      }),
    );

    // Both entries balance...
    expect(billEntry.totalDebit.equals(billEntry.totalCredit)).toBe(true);
    expect(paymentEntry.totalDebit.equals(paymentEntry.totalCredit)).toBe(true);

    // ...and the vendor's payable nets to zero once the bill is paid in full.
    const creditorMovement = [...billEntry.lines, ...paymentEntry.lines]
      .filter((line) => line.accountId === ACCOUNTS.creditors)
      .reduce((balance, line) => balance.plus(line.debit).minus(line.credit), toMoney("0"));

    expect(creditorMovement.toFixed(2)).toBe("0.00");
  });
});
