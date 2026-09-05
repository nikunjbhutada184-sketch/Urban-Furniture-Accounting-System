import { describe, expect, it } from "vitest";
import {
  balanceSheetDocument,
  profitAndLossDocument,
  reportFileName,
} from "@/modules/reporting/pdf/financial-report-pdf";
import { renderReportPdf } from "@/modules/reporting/pdf/report-pdf";
import {
  type BalanceSheetReport,
  type ProfitAndLossReport,
  type ReportLine,
} from "@/modules/reporting/report-service";

/**
 * The report PDFs.
 *
 * Two things matter here and nothing else does. First, the document must carry
 * exactly the figures the service produced -- the PDF is the report, not a
 * second calculation of it. Second, it must paginate: an earlier version wrote
 * its footer below the bottom margin, which made pdfkit silently add a blank
 * page for every footer it drew.
 */

const PERIOD = { from: new Date("2026-04-01"), to: new Date("2027-03-31") };

function lines(count: number, prefix: string): ReportLine[] {
  return Array.from({ length: count }, (_, index) => ({
    accountId: `id-${index}`,
    code: `${prefix}${String(index).padStart(3, "0")}`,
    name: `Account ${index} with a reasonably long descriptive name`,
    amount: `${((index + 1) * 1234.5).toFixed(2)}`,
  }));
}

function profitAndLoss(overrides: Partial<ProfitAndLossReport> = {}): ProfitAndLossReport {
  return {
    income: [],
    expenses: [],
    totalIncome: "0.00",
    totalExpenses: "0.00",
    netProfit: "0.00",
    isProfit: true,
    ...overrides,
  };
}

function balanceSheet(overrides: Partial<BalanceSheetReport> = {}): BalanceSheetReport {
  return {
    assets: [],
    liabilities: [],
    capital: [],
    totalAssets: "0.00",
    totalLiabilities: "0.00",
    totalCapital: "0.00",
    totalLiabilitiesAndCapital: "0.00",
    netProfit: "0.00",
    isBalanced: true,
    difference: "0.00",
    ...overrides,
  };
}

/** Counts pages without a PDF parser: every page object is marked `/Type /Page`. */
function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe("profitAndLossDocument", () => {
  it("carries the service's figures through unchanged", () => {
    const document = profitAndLossDocument(
      profitAndLoss({
        income: lines(2, "4"),
        totalIncome: "18000.00",
        totalExpenses: "7500.50",
        netProfit: "10499.50",
      }),
      PERIOD,
      "Urban Furniture",
    );

    expect(document.summary.map((item) => item.value)).toEqual(["18000.00", "7500.50", "10499.50"]);
    expect(document.tables[0]?.total).toEqual({ label: "Total income", value: "18000.00" });
    expect(document.tables[0]?.rows).toEqual([
      ["4000", "Account 0 with a reasonably long descriptive name", "1234.50"],
      ["4001", "Account 1 with a reasonably long descriptive name", "2469.00"],
    ]);
  });

  it("labels a loss as a loss", () => {
    const document = profitAndLossDocument(
      profitAndLoss({ netProfit: "-500.00", isProfit: false }),
      PERIOD,
      "Urban Furniture",
    );

    expect(document.summary[2]?.label).toBe("Net loss");
    expect(document.summary[2]?.tone).toBe("negative");
    expect(document.closing?.value).toBe("-500.00");
  });

  it("spells the period out", () => {
    const document = profitAndLossDocument(profitAndLoss(), PERIOD, "Urban Furniture");
    expect(document.periodLabel).toBe("1 April 2026 to 31 March 2027");
  });
});

describe("balanceSheetDocument", () => {
  it("says so when the sheet balances", () => {
    const document = balanceSheetDocument(balanceSheet(), PERIOD, "Urban Furniture");

    expect(document.notice?.tone).toBe("positive");
    expect(document.closing?.value).toBe("Balanced");
  });

  it("reports the difference when it does not", () => {
    const document = balanceSheetDocument(
      balanceSheet({ isBalanced: false, difference: "42.00" }),
      PERIOD,
      "Urban Furniture",
    );

    expect(document.notice?.tone).toBe("negative");
    expect(document.notice?.text).toContain("42.00");
    expect(document.closing?.value).toBe("Out by 42.00");
  });

  it("shows the period's profit as its own line inside capital", () => {
    const document = balanceSheetDocument(
      balanceSheet({ capital: lines(1, "3"), netProfit: "999.00" }),
      PERIOD,
      "Urban Furniture",
    );

    const capital = document.tables.find((table) => table.title === "Capital");
    expect(capital?.extraRow).toEqual(["", "Profit for the period", "999.00"]);
  });
});

describe("renderReportPdf", () => {
  it("produces a single page for a report that fits on one", async () => {
    const pdf = await renderReportPdf(
      profitAndLossDocument(
        profitAndLoss({ income: lines(5, "4"), expenses: lines(5, "5") }),
        PERIOD,
        "Urban Furniture",
      ),
    );

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // Regression: the footer used to be drawn past the bottom margin, which
    // made pdfkit add an extra page for every footer it wrote.
    expect(pageCount(pdf)).toBe(1);
  });

  it("paginates a long report instead of overflowing", async () => {
    const pdf = await renderReportPdf(
      profitAndLossDocument(
        profitAndLoss({ income: lines(70, "4"), expenses: lines(70, "5") }),
        PERIOD,
        "Urban Furniture",
      ),
    );

    const pages = pageCount(pdf);
    // ~40 rows to a page: 140 rows plus headings should be a handful of pages,
    // not one enormous one and not one per row.
    expect(pages).toBeGreaterThan(2);
    expect(pages).toBeLessThan(8);
  });

  it("renders an empty report rather than failing", async () => {
    const pdf = await renderReportPdf(
      balanceSheetDocument(balanceSheet(), PERIOD, "Urban Furniture"),
    );

    expect(pageCount(pdf)).toBe(1);
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});

describe("reportFileName", () => {
  it("names the file after the report and its period", () => {
    expect(reportFileName("balance-sheet", PERIOD)).toBe(
      "balance-sheet_2026-04-01_to_2027-03-31.pdf",
    );
  });
});
