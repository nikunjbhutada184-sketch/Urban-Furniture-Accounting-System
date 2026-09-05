import { describe, expect, it } from "vitest";
import {
  Decimal,
  add,
  formatMoney,
  lineAmount,
  percentOf,
  subtract,
  sum,
  toAmountString,
  toMoney,
} from "@/server/money";

describe("money helpers", () => {
  it("keeps decimal precision that floats would lose", () => {
    expect(add("0.1", "0.2").toFixed(2)).toBe("0.30");
    expect(sum(["0.1", "0.2", "0.3"]).toFixed(2)).toBe("0.60");
    // The float equivalent: 0.1 + 0.2 === 0.30000000000000004
    expect(add("0.1", "0.2").equals(new Decimal("0.3"))).toBe(true);
  });

  it("rounds half up at the monetary scale", () => {
    expect(toMoney("1.005").toFixed(2)).toBe("1.01");
    expect(toMoney("1.004").toFixed(2)).toBe("1.00");
    // Half-up rounds away from zero, so negatives are symmetric with positives.
    expect(toMoney("-1.005").toFixed(2)).toBe("-1.01");
  });

  it("computes a line amount with a single final rounding", () => {
    // 3 x 1234.5678 = 3703.7034 -> 3703.70
    expect(lineAmount("3", "1234.5678").toFixed(2)).toBe("3703.70");
  });

  it("computes tax as a percentage", () => {
    expect(percentOf("22500.00", "18").toFixed(2)).toBe("4050.00");
    expect(percentOf("4500.00", "5").toFixed(2)).toBe("225.00");
  });

  it("sums an empty list to zero", () => {
    expect(sum([]).toFixed(2)).toBe("0.00");
  });

  it("subtracts exactly", () => {
    expect(subtract("26550.00", "26550.00").isZero()).toBe(true);
    expect(subtract("1000.00", "999.99").toFixed(2)).toBe("0.01");
  });

  it("serialises amounts as fixed-scale strings for the client boundary", () => {
    expect(toAmountString("1234.5")).toBe("1234.50");
    expect(toAmountString(0)).toBe("0.00");
  });

  it("formats amounts for display", () => {
    const formatted = formatMoney("26550.00", { currency: "INR", locale: "en-IN" });
    expect(formatted).toContain("26,550.00");
  });

  it("reproduces a realistic invoice total exactly", () => {
    // 5 office chairs @ 4500 + 18% GST
    const net = lineAmount("5", "4500.00");
    const tax = percentOf(net, "18");
    const total = add(net, tax);

    expect(net.toFixed(2)).toBe("22500.00");
    expect(tax.toFixed(2)).toBe("4050.00");
    expect(total.toFixed(2)).toBe("26550.00");
  });
});
