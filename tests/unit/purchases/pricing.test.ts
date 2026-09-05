import { describe, expect, it } from "vitest";
import {
  computeDocumentTotals,
  computeLineAmounts,
  computeTax,
  groupSubtotalByAccount,
  groupTaxByAccount,
} from "@/modules/purchases/pricing";
import { toMoney } from "@/server/money";

/**
 * Document pricing.
 *
 * Every order, bill and invoice total in the system comes from these
 * functions, so they are tested against the exact figures from the
 * specification's worked examples.
 */

describe("computeLineAmounts", () => {
  it("computes an untaxed line", () => {
    const amounts = computeLineAmounts("5", "4500.00", null);

    expect(amounts.subtotal.toFixed(2)).toBe("22500.00");
    expect(amounts.taxAmount.toFixed(2)).toBe("0.00");
    expect(amounts.total.toFixed(2)).toBe("22500.00");
  });

  it("computes a line with percentage tax", () => {
    const amounts = computeLineAmounts("5", "4500.00", {
      computation: "PERCENTAGE",
      rate: "18",
    });

    expect(amounts.subtotal.toFixed(2)).toBe("22500.00");
    expect(amounts.taxAmount.toFixed(2)).toBe("4050.00");
    expect(amounts.total.toFixed(2)).toBe("26550.00");
  });

  it("computes a line with fixed tax", () => {
    const amounts = computeLineAmounts("2", "1000.00", { computation: "FIXED", rate: "50" });

    expect(amounts.subtotal.toFixed(2)).toBe("2000.00");
    expect(amounts.taxAmount.toFixed(2)).toBe("50.00");
    expect(amounts.total.toFixed(2)).toBe("2050.00");
  });

  it("handles fractional quantities without float drift", () => {
    // 2.5 x 1234.56 = 3086.40 exactly
    const amounts = computeLineAmounts("2.5", "1234.56", null);
    expect(amounts.subtotal.toFixed(2)).toBe("3086.40");
  });

  it("rounds the line subtotal once, to two places", () => {
    // 3 x 1234.5678 = 3703.7034 -> 3703.70
    const amounts = computeLineAmounts("3", "1234.5678", null);
    expect(amounts.subtotal.toFixed(2)).toBe("3703.70");
  });

  it("computes tax on the rounded subtotal", () => {
    const amounts = computeLineAmounts("3", "1234.5678", {
      computation: "PERCENTAGE",
      rate: "18",
    });

    // 18% of 3703.70 = 666.666 -> 666.67
    expect(amounts.taxAmount.toFixed(2)).toBe("666.67");
    expect(amounts.total.toFixed(2)).toBe("4370.37");
  });

  it("treats a zero price as a zero line", () => {
    const amounts = computeLineAmounts("10", "0", { computation: "PERCENTAGE", rate: "18" });
    expect(amounts.total.toFixed(2)).toBe("0.00");
  });
});

describe("computeTax", () => {
  it("is zero with no tax rule", () => {
    expect(computeTax("1000.00", null).toFixed(2)).toBe("0.00");
    expect(computeTax("1000.00").toFixed(2)).toBe("0.00");
  });

  it("computes the seeded GST rates", () => {
    expect(computeTax("1000.00", { computation: "PERCENTAGE", rate: "5" }).toFixed(2)).toBe("50.00");
    expect(computeTax("1000.00", { computation: "PERCENTAGE", rate: "12" }).toFixed(2)).toBe("120.00");
    expect(computeTax("1000.00", { computation: "PERCENTAGE", rate: "18" }).toFixed(2)).toBe("180.00");
  });
});

describe("computeDocumentTotals", () => {
  it("sums already-rounded line amounts", () => {
    const lines = [
      computeLineAmounts("5", "4500.00", { computation: "PERCENTAGE", rate: "18" }),
      computeLineAmounts("2", "12000.00", { computation: "PERCENTAGE", rate: "18" }),
    ];

    const totals = computeDocumentTotals(lines);

    expect(totals.amountUntaxed.toFixed(2)).toBe("46500.00");
    expect(totals.amountTax.toFixed(2)).toBe("8370.00");
    expect(totals.amountTotal.toFixed(2)).toBe("54870.00");
  });

  it("returns zeros for an empty document", () => {
    const totals = computeDocumentTotals([]);

    expect(totals.amountUntaxed.toFixed(2)).toBe("0.00");
    expect(totals.amountTotal.toFixed(2)).toBe("0.00");
  });

  it("keeps untaxed + tax === total for many awkward lines", () => {
    const lines = Array.from({ length: 25 }, (_, index) =>
      computeLineAmounts(String(index + 1), "33.33", { computation: "PERCENTAGE", rate: "18" }),
    );

    const totals = computeDocumentTotals(lines);

    expect(totals.amountUntaxed.plus(totals.amountTax).equals(totals.amountTotal)).toBe(true);
  });
});

describe("grouping for the journal entry", () => {
  it("merges lines that share an expense account", () => {
    const grouped = groupSubtotalByAccount([
      { accountId: "acc_purchases", subtotal: toMoney("1000.00") },
      { accountId: "acc_purchases", subtotal: toMoney("500.00") },
      { accountId: "acc_freight", subtotal: toMoney("250.00") },
    ]);

    expect(grouped.size).toBe(2);
    expect(grouped.get("acc_purchases")?.toFixed(2)).toBe("1500.00");
    expect(grouped.get("acc_freight")?.toFixed(2)).toBe("250.00");
  });

  it("merges tax by account and skips zero-tax lines", () => {
    const grouped = groupTaxByAccount([
      { taxAmount: toMoney("180.00"), taxAccountId: "acc_input_tax" },
      { taxAmount: toMoney("90.00"), taxAccountId: "acc_input_tax" },
      { taxAmount: toMoney("0.00"), taxAccountId: "acc_input_tax" },
      { taxAmount: toMoney("40.00"), taxAccountId: null },
    ]);

    expect(grouped.size).toBe(1);
    expect(grouped.get("acc_input_tax")?.toFixed(2)).toBe("270.00");
  });
});
