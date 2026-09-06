import { type DbClient, prisma } from "@/server/db/prisma";
import { AGEING_BUCKETS, getAgeingReport } from "./partner-ledger-service";
import {
  type ReportPeriod,
  getBalanceSheet,
  getBudgetReport,
  getCustomerOutstandingReport,
  getProfitAndLoss,
  getStockReport,
  getTrialBalanceReport,
  getVendorOutstandingReport,
} from "./report-service";
import { type CsvSection, renderCsv } from "./csv";

/**
 * Every report, as CSV.
 *
 * One registry rather than a route per report: adding a report here gives it a
 * working download with no new route, and the export cannot drift from the
 * report because both call the same service.
 */

export const CSV_REPORTS = [
  "trial-balance",
  "profit-and-loss",
  "balance-sheet",
  "budget",
  "stock",
  "customer-outstanding",
  "vendor-outstanding",
  "customer-ageing",
  "vendor-ageing",
] as const;

export type CsvReportSlug = (typeof CSV_REPORTS)[number];

export function isCsvReport(value: string | undefined): value is CsvReportSlug {
  return typeof value === "string" && (CSV_REPORTS as readonly string[]).includes(value);
}

const ISO = (date: Date) => date.toISOString().slice(0, 10);

/** The period, written above every export so a saved file stays meaningful. */
function meta(period: ReportPeriod): string[][] {
  return [
    ["From", ISO(period.from)],
    ["To", ISO(period.to)],
    ["Generated", new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"],
    ["Source", "Posted journal entries. Derived at export time; nothing is stored."],
  ];
}

export async function renderReportCsv(
  slug: CsvReportSlug,
  period: ReportPeriod,
  client: DbClient = prisma,
): Promise<string> {
  switch (slug) {
    case "trial-balance":
      return trialBalanceCsv(period, client);
    case "profit-and-loss":
      return profitAndLossCsv(period, client);
    case "balance-sheet":
      return balanceSheetCsv(period, client);
    case "budget":
      return budgetCsv(period, client);
    case "stock":
      return stockCsv(period, client);
    case "customer-outstanding":
      return outstandingCsv(period, client, "customer");
    case "vendor-outstanding":
      return outstandingCsv(period, client, "vendor");
    case "customer-ageing":
      return ageingCsv(period, client, "RECEIVABLE");
    case "vendor-ageing":
      return ageingCsv(period, client, "PAYABLE");
  }
}

async function trialBalanceCsv(period: ReportPeriod, client: DbClient): Promise<string> {
  const report = await getTrialBalanceReport(period, client);

  return renderCsv({
    title: "Trial Balance",
    meta: [
      ...meta(period),
      ["Balanced", report.isBalanced ? "Yes" : `No, out by ${report.difference}`],
    ],
    sections: [
      {
        headers: ["Code", "Account", "Type", "Debit", "Credit"],
        rows: report.rows.map((row) => [row.code, row.name, row.type, row.debit, row.credit]),
        footer: ["", "Total", "", report.totalDebit, report.totalCredit],
      },
    ],
  });
}

async function profitAndLossCsv(period: ReportPeriod, client: DbClient): Promise<string> {
  const report = await getProfitAndLoss(period, client);

  return renderCsv({
    title: "Profit & Loss",
    meta: meta(period),
    sections: [
      {
        title: "Income",
        headers: ["Code", "Account", "Amount"],
        rows: report.income.map((line) => [line.code, line.name, line.amount]),
        footer: ["", "Total income", report.totalIncome],
      },
      {
        title: "Expenses",
        headers: ["Code", "Account", "Amount"],
        rows: report.expenses.map((line) => [line.code, line.name, line.amount]),
        footer: ["", "Total expenses", report.totalExpenses],
      },
      {
        title: "Result",
        headers: ["Measure", "Amount"],
        rows: [
          ["Total income", report.totalIncome],
          ["Total expenses", report.totalExpenses],
        ],
        footer: [report.isProfit ? "Net profit" : "Net loss", report.netProfit],
      },
    ],
  });
}

async function balanceSheetCsv(period: ReportPeriod, client: DbClient): Promise<string> {
  const report = await getBalanceSheet(period, client);

  const section = (
    title: string,
    lines: { code: string; name: string; amount: string }[],
    total: [string, string],
  ): CsvSection => ({
    title,
    headers: ["Code", "Account", "Balance"],
    rows: lines.map((line) => [line.code, line.name, line.amount]),
    footer: ["", total[0], total[1]],
  });

  return renderCsv({
    title: "Balance Sheet",
    meta: [
      ["As at", ISO(period.to)],
      ...meta(period),
      ["Balanced", report.isBalanced ? "Yes" : `No, out by ${report.difference}`],
    ],
    sections: [
      section("Assets", report.assets, ["Total assets", report.totalAssets]),
      section("Liabilities", report.liabilities, ["Total liabilities", report.totalLiabilities]),
      {
        title: "Capital",
        headers: ["Code", "Account", "Balance"],
        rows: [
          ...report.capital.map((line) => [line.code, line.name, line.amount]),
          ["", "Retained earnings", report.retainedEarnings],
        ],
        footer: ["", "Total capital", report.totalCapital],
      },
    ],
  });
}

async function budgetCsv(period: ReportPeriod, client: DbClient): Promise<string> {
  const rows = await getBudgetReport(period, client);

  return renderCsv({
    title: "Budget Report",
    meta: meta(period),
    sections: [
      {
        headers: [
          "Budget",
          "Status",
          "Analytic code",
          "Analytic",
          "Type",
          "Planned",
          "Committed",
          "Achieved",
          "Achieved %",
          "Amount to achieve",
        ],
        rows: rows.map((row) => [
          row.budgetName,
          row.budgetStatus,
          row.analyticCode,
          row.analyticName,
          row.type,
          row.planned,
          row.committed,
          row.achieved,
          row.achievedPercent === null ? "" : String(row.achievedPercent),
          row.toAchieve,
        ]),
      },
    ],
  });
}

async function stockCsv(period: ReportPeriod, client: DbClient): Promise<string> {
  const rows = await getStockReport(period, client);

  return renderCsv({
    title: "Stock Report",
    meta: meta(period),
    sections: [
      {
        headers: [
          "SKU",
          "Product",
          "Opening",
          "Purchases",
          "Sales",
          "Adjustments",
          "Closing",
          "Value",
        ],
        rows: rows.map((row) => [
          row.sku ?? "",
          row.name,
          row.opening,
          row.purchases,
          row.sales,
          row.adjustments,
          row.closing,
          row.value,
        ]),
      },
    ],
  });
}

async function outstandingCsv(
  period: ReportPeriod,
  client: DbClient,
  side: "customer" | "vendor",
): Promise<string> {
  const report =
    side === "customer"
      ? await getCustomerOutstandingReport(period, client)
      : await getVendorOutstandingReport(period, client);

  return renderCsv({
    title: side === "customer" ? "Customer Outstanding" : "Vendor Outstanding",
    meta: [...meta(period), ["Total overdue", report.totalOverdue]],
    sections: [
      {
        headers: [
          side === "customer" ? "Customer" : "Vendor",
          "Document",
          "Date",
          "Due",
          "Overdue",
          "Total",
          "Paid",
          "Outstanding",
        ],
        rows: report.rows.map((row) => [
          row.contactName,
          row.documentNumber,
          ISO(row.documentDate),
          row.dueDate ? ISO(row.dueDate) : "",
          row.isOverdue ? "Yes" : "No",
          row.total,
          row.paid,
          row.outstanding,
        ]),
        footer: ["", "", "", "", "Total", "", "", report.totalOutstanding],
      },
    ],
  });
}

async function ageingCsv(
  period: ReportPeriod,
  client: DbClient,
  side: "RECEIVABLE" | "PAYABLE",
): Promise<string> {
  const report = await getAgeingReport({ side, asAt: period.to }, client);
  const bucketLabels = AGEING_BUCKETS.map((bucket) => bucket.label);

  return renderCsv({
    title: side === "RECEIVABLE" ? "Customer Ageing" : "Vendor Ageing",
    meta: [["As at", ISO(report.asAt)], ...meta(period)],
    sections: [
      {
        headers: [
          side === "RECEIVABLE" ? "Customer" : "Vendor",
          ...bucketLabels,
          "Total",
          "Oldest (days)",
        ],
        rows: report.rows.map((row) => [
          row.contactName,
          ...AGEING_BUCKETS.map((bucket) => row.buckets[bucket.key]),
          row.total,
          String(row.oldestDays),
        ]),
        footer: [
          "Total",
          ...AGEING_BUCKETS.map((bucket) => report.totals[bucket.key]),
          report.grandTotal,
          "",
        ],
      },
    ],
  });
}
