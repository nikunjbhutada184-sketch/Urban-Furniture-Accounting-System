import { type DbClient, prisma } from "@/server/db/prisma";
import {
  type BalanceSheetReport,
  type ProfitAndLossReport,
  type ReportLine,
  type ReportPeriod,
  getBalanceSheet,
  getProfitAndLoss,
} from "@/modules/reporting/report-service";
import { type ReportPdfInput, type ReportTable, renderReportPdf } from "./report-pdf";

/**
 * Downloadable Profit & Loss and Balance Sheet.
 *
 * Both call the same service the screen calls, so the PDF is the report — not
 * a re-derivation of it. Nothing here adds, subtracts or rounds: the strings
 * arrive already formatted from `report-service` and are only laid out.
 */

const COLUMNS: ReportTable["columns"] = [
  { label: "Code", width: 0.16 },
  { label: "Account", width: 0.54 },
  { label: "Amount", width: 0.3, align: "right", numeric: true },
];

/** "1 April 2026 to 5 September 2026" — spelled out, for a printed document. */
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function toRows(lines: ReportLine[]): string[][] {
  return lines.map((line) => [line.code, line.name, line.amount]);
}

/** The company's own name, so a printed report identifies who it belongs to. */
async function companyName(client: DbClient): Promise<string> {
  const settings = await client.companySettings.findUnique({
    where: { id: "company" },
    select: { name: true },
  });

  return settings?.name ?? "Urban Furniture";
}

/** A filename that sorts chronologically and says what it contains. */
export function reportFileName(slug: string, period: ReportPeriod): string {
  const from = period.from.toISOString().slice(0, 10);
  const to = period.to.toISOString().slice(0, 10);
  return `${slug}_${from}_to_${to}.pdf`;
}

export async function renderProfitAndLossPdf(
  period: ReportPeriod,
  client: DbClient = prisma,
): Promise<Buffer> {
  const [report, name] = await Promise.all([getProfitAndLoss(period, client), companyName(client)]);

  return renderReportPdf(profitAndLossDocument(report, period, name));
}

export async function renderBalanceSheetPdf(
  period: ReportPeriod,
  client: DbClient = prisma,
): Promise<Buffer> {
  const [report, name] = await Promise.all([getBalanceSheet(period, client), companyName(client)]);

  return renderReportPdf(balanceSheetDocument(report, period, name));
}

// ---------------------------------------------------------------------------
// Document shapes — pure, so they can be asserted without a database.
// ---------------------------------------------------------------------------

export function profitAndLossDocument(
  report: ProfitAndLossReport,
  period: ReportPeriod,
  company: string,
): ReportPdfInput {
  return {
    companyName: company,
    title: "Profit & Loss",
    periodLabel: `${formatDate(period.from)} to ${formatDate(period.to)}`,
    description: "Income less expenses, from posted journal entries only.",
    summary: [
      { label: "Total income", value: report.totalIncome },
      { label: "Total expenses", value: report.totalExpenses },
      {
        label: report.isProfit ? "Net profit" : "Net loss",
        value: report.netProfit,
        tone: report.isProfit ? "positive" : "negative",
      },
    ],
    tables: [
      {
        title: "Income",
        columns: COLUMNS,
        rows: toRows(report.income),
        total: { label: "Total income", value: report.totalIncome },
        emptyLabel: "No income posted in this period.",
      },
      {
        title: "Expenses",
        columns: COLUMNS,
        rows: toRows(report.expenses),
        total: { label: "Total expenses", value: report.totalExpenses },
        emptyLabel: "No expenses posted in this period.",
      },
    ],
    closing: {
      label: `Total income ${report.totalIncome} less total expenses ${report.totalExpenses} gives the ${
        report.isProfit ? "profit" : "loss"
      } for the period`,
      value: report.netProfit,
    },
  };
}

export function balanceSheetDocument(
  report: BalanceSheetReport,
  period: ReportPeriod,
  company: string,
): ReportPdfInput {
  return {
    companyName: company,
    title: "Balance Sheet",
    periodLabel: `As at ${formatDate(period.to)}`,
    description:
      "Assets, liabilities and capital. This period's profit is folded into capital, because income and expense accounts are not closed until year end.",
    notice: report.isBalanced
      ? {
          tone: "positive",
          text: "Assets = Liabilities + Capital. The balance sheet balances.",
        }
      : {
          tone: "negative",
          text: `Assets do not equal Liabilities + Capital. Difference: ${report.difference}.`,
        },
    summary: [
      { label: "Total assets", value: report.totalAssets, tone: "positive" },
      { label: "Total liabilities", value: report.totalLiabilities },
      { label: "Total capital", value: report.totalCapital },
    ],
    tables: [
      {
        title: "Assets",
        columns: COLUMNS,
        rows: toRows(report.assets),
        total: { label: "Total assets", value: report.totalAssets },
        emptyLabel: "No asset balances as at this date.",
      },
      {
        title: "Liabilities",
        columns: COLUMNS,
        rows: toRows(report.liabilities),
        total: { label: "Total liabilities", value: report.totalLiabilities },
        emptyLabel: "No liability balances as at this date.",
      },
      {
        title: "Capital",
        columns: COLUMNS,
        rows: toRows(report.capital),
        // Retained earnings, not the period's profit: this is the figure that
        // makes assets equal liabilities plus capital.
        extraRow: ["", "Retained earnings", report.retainedEarnings],
        total: { label: "Total capital", value: report.totalCapital },
        emptyLabel: "No capital balances as at this date.",
      },
    ],
    closing: {
      label: `Assets ${report.totalAssets}  =  Liabilities ${report.totalLiabilities}  +  Capital ${report.totalCapital}`,
      value: report.isBalanced ? "Balanced" : `Out by ${report.difference}`,
    },
  };
}
