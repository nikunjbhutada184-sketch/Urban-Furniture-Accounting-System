import PDFDocument from "pdfkit";

/**
 * PDF rendering for the financial reports.
 *
 * This module knows how to *draw* a report; it never works out what the
 * figures are. Every number arriving here is already a formatted string from
 * `report-service`, computed from posted journal items — so a downloaded PDF
 * and the screen it came from cannot disagree, and there is no second
 * implementation of the accounting to drift.
 *
 * Only the base-14 Helvetica faces are used, so nothing has to be embedded and
 * the file stays small.
 */

const PAGE_MARGIN = 42;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const CONTENT_WIDTH = A4_WIDTH - PAGE_MARGIN * 2;

/**
 * pdfkit starts a new page the moment a write would cross the bottom margin,
 * so everything drawn -- the footer included -- has to stay above this line.
 * Writing the footer below it silently multiplied the page count.
 */
const MAX_Y = A4_HEIGHT - PAGE_MARGIN;

/** The footer sits just inside the printable area, with the rule above it. */
const FOOTER_BASELINE = MAX_Y - 26;
const FOOTER_RULE_Y = FOOTER_BASELINE - 10;

/** Content must stop short of the footer rule, with a little air. */
const BOTTOM_LIMIT = FOOTER_RULE_Y - 16;

const INK = "#111827";
const MUTED = "#6b7280";
const RULE = "#d1d5db";
const ACCENT = "#1baf7a";
const NEGATIVE = "#b4441c";

export interface ReportColumn {
  /** Column heading. */
  label: string;
  /** Share of the content width, as a fraction. Must sum to 1 across columns. */
  width: number;
  align?: "left" | "right";
  /** Renders in the tabular treatment used for money. */
  numeric?: boolean;
}

export interface ReportTable {
  title: string;
  columns: ReportColumn[];
  rows: string[][];
  /** Drawn above the total, in italic — e.g. "Profit for the period". */
  extraRow?: string[];
  total?: { label: string; value: string };
  emptyLabel: string;
}

export interface ReportPdfInput {
  companyName: string;
  title: string;
  /** e.g. "1 April 2026 to 5 September 2026". */
  periodLabel: string;
  /** Short sentence under the title explaining what the report shows. */
  description: string;
  /** The headline figures, drawn as a strip of boxes under the title. */
  summary: { label: string; value: string; tone?: "default" | "positive" | "negative" }[];
  tables: ReportTable[];
  /** A closing statement, e.g. the accounting equation. */
  closing?: { label: string; value: string };
  /** Shown in a tinted box — the balanced/unbalanced note. */
  notice?: { text: string; tone: "positive" | "negative" };
}

type Doc = InstanceType<typeof PDFDocument>;

// ---------------------------------------------------------------------------
// Text safety
// ---------------------------------------------------------------------------

/**
 * The characters the base-14 Helvetica faces can actually draw.
 *
 * pdfkit encodes standard fonts as WinAnsi, which is Latin-1 plus a specific
 * block between 0x80 and 0x9F. A character outside it does not fail loudly --
 * it draws as the wrong glyph. A true minus sign (U+2212) in a total line came
 * out as a double quote: "Subtotal 416977.00 + Tax 39682.28 " Received".
 */
const WINANSI_HIGH = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

/** Typographic characters worth keeping as a readable equivalent. */
const SUBSTITUTIONS: Record<string, string> = {
  "−": "-", // minus sign
  "–": "-", // en dash, safe but narrower than intended at small sizes
  "₹": "Rs.", // rupee sign
  " ": " ", // non-breaking space
  "→": "->",
  "≤": "<=",
  "≥": ">=",
};

/**
 * Makes a string drawable by a standard PDF font.
 *
 * Substitutes what has a sensible equivalent and replaces anything else
 * outside WinAnsi with "?". Non-Latin scripts therefore do not survive -- a
 * product named in Devanagari would need an embedded Unicode font, which is a
 * deliberate trade for keeping these files small.
 */
export function pdfSafe(value: string): string {
  let out = "";

  for (const character of value) {
    const substitute = SUBSTITUTIONS[character];
    if (substitute !== undefined) {
      out += substitute;
      continue;
    }

    const code = character.codePointAt(0) ?? 0;
    const drawable =
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff) ||
      WINANSI_HIGH.includes(character);

    out += drawable ? character : "?";
  }

  return out;
}

/** Applies {@link pdfSafe} to every string in a document, once, at the door. */
function sanitise(input: ReportPdfInput): ReportPdfInput {
  return {
    ...input,
    companyName: pdfSafe(input.companyName),
    title: pdfSafe(input.title),
    periodLabel: pdfSafe(input.periodLabel),
    description: pdfSafe(input.description),
    notice: input.notice ? { ...input.notice, text: pdfSafe(input.notice.text) } : undefined,
    summary: input.summary.map((item) => ({
      ...item,
      label: pdfSafe(item.label),
      value: pdfSafe(item.value),
    })),
    tables: input.tables.map((table) => ({
      ...table,
      title: pdfSafe(table.title),
      emptyLabel: pdfSafe(table.emptyLabel),
      columns: table.columns.map((column) => ({ ...column, label: pdfSafe(column.label) })),
      rows: table.rows.map((row) => row.map(pdfSafe)),
      extraRow: table.extraRow?.map(pdfSafe),
      total: table.total
        ? { label: pdfSafe(table.total.label), value: pdfSafe(table.total.value) }
        : undefined,
    })),
    closing: input.closing
      ? { label: pdfSafe(input.closing.label), value: pdfSafe(input.closing.value) }
      : undefined,
  };
}

/**
 * Renders a report to a PDF and resolves the finished bytes.
 *
 * `bufferPages` keeps every page in memory until `end()`, which is what makes
 * "Page 1 of 3" possible: the total is not known until the last row is drawn.
 */
export async function renderReportPdf(raw: ReportPdfInput): Promise<Buffer> {
  const input = sanitise(raw);

  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    bufferPages: true,
    info: {
      Title: `${input.title} — ${input.companyName}`,
      Author: input.companyName,
      Subject: input.description,
      Creator: "Urban Furniture Accounting",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawTitle(doc, input);
  if (input.notice) drawNotice(doc, input.notice);
  if (input.summary.length > 0) drawSummary(doc, input.summary);

  for (const table of input.tables) {
    drawTable(doc, table);
  }

  if (input.closing) drawClosing(doc, input.closing);

  stampFooters(doc, input);

  doc.end();
  return finished;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function drawTitle(doc: Doc, input: ReportPdfInput): void {
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(ACCENT)
    .text(input.companyName.toUpperCase(), PAGE_MARGIN, PAGE_MARGIN, { characterSpacing: 0.8 });

  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(20).fillColor(INK).text(input.title);

  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(input.periodLabel);
  doc.text(input.description);

  doc.moveDown(0.8);
  rule(doc);
  doc.moveDown(0.8);
}

function drawNotice(doc: Doc, notice: NonNullable<ReportPdfInput["notice"]>): void {
  const colour = notice.tone === "positive" ? ACCENT : NEGATIVE;
  const top = doc.y;
  const height = doc.heightOfString(notice.text, { width: CONTENT_WIDTH - 20 }) + 14;

  doc
    .roundedRect(PAGE_MARGIN, top, CONTENT_WIDTH, height, 5)
    .fillOpacity(0.08)
    .fill(colour)
    .fillOpacity(1);

  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(colour)
    .text(notice.text, PAGE_MARGIN + 10, top + 7, { width: CONTENT_WIDTH - 20 });

  doc.y = top + height + 14;
}

/** The headline figures, as a row of equal boxes. */
function drawSummary(doc: Doc, summary: ReportPdfInput["summary"]): void {
  const gap = 10;
  const boxWidth = (CONTENT_WIDTH - gap * (summary.length - 1)) / summary.length;
  const top = doc.y;
  const height = 48;

  summary.forEach((item, index) => {
    const left = PAGE_MARGIN + index * (boxWidth + gap);

    doc.roundedRect(left, top, boxWidth, height, 6).lineWidth(0.7).strokeColor(RULE).stroke();

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(MUTED)
      .text(item.label.toUpperCase(), left + 10, top + 10, {
        width: boxWidth - 20,
        characterSpacing: 0.5,
      });

    const tone = item.tone === "positive" ? ACCENT : item.tone === "negative" ? NEGATIVE : INK;

    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(tone)
      .text(item.value, left + 10, top + 24, { width: boxWidth - 20 });
  });

  doc.y = top + height + 18;
}

function drawTable(doc: Doc, table: ReportTable): void {
  ensureSpace(doc, 90);

  doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(table.title, PAGE_MARGIN, doc.y);
  doc.moveDown(0.45);

  drawHeaderRow(doc, table.columns);

  if (table.rows.length === 0) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor(MUTED)
      .text(table.emptyLabel, PAGE_MARGIN, doc.y + 6, { width: CONTENT_WIDTH, align: "center" });
    doc.y += 20;
  }

  for (const row of table.rows) {
    // A row that would fall off the page starts the next one, and the heading
    // and column labels are repeated there so the figures stay readable.
    if (ensureSpace(doc, 26)) drawContinuation(doc, table);
    drawRow(doc, table.columns, row, { font: "Helvetica", size: 9.5, colour: INK });
  }

  if (table.extraRow) {
    if (ensureSpace(doc, 26)) drawContinuation(doc, table);
    drawRow(doc, table.columns, table.extraRow, {
      font: "Helvetica-Oblique",
      size: 9.5,
      colour: MUTED,
    });
  }

  if (table.total) {
    if (ensureSpace(doc, 30)) drawContinuation(doc, table);
    const top = doc.y;

    doc
      .moveTo(PAGE_MARGIN, top)
      .lineTo(PAGE_MARGIN + CONTENT_WIDTH, top)
      .lineWidth(0.8)
      .strokeColor(INK)
      .stroke();

    // Both halves are drawn from the same baseline, so the label and the
    // figure line up rather than drifting apart by a line height.
    const totalBaseline = top + 7;

    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(INK)
      .text(table.total.label, PAGE_MARGIN, totalBaseline, {
        width: CONTENT_WIDTH * 0.6,
        lineBreak: false,
      });

    doc.text(table.total.value, PAGE_MARGIN, totalBaseline, {
      width: CONTENT_WIDTH,
      align: "right",
      lineBreak: false,
    });

    doc.y = totalBaseline + 18;
  }

  doc.moveDown(1.4);
}

/** Repeats a table's heading and column labels after a page break. */
function drawContinuation(doc: Doc, table: ReportTable): void {
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(INK)
    .text(`${table.title} (continued)`, PAGE_MARGIN, doc.y);

  doc.moveDown(0.45);
  drawHeaderRow(doc, table.columns);
}

function drawClosing(doc: Doc, closing: { label: string; value: string }): void {
  ensureSpace(doc, 60);

  const top = doc.y;
  doc.roundedRect(PAGE_MARGIN, top, CONTENT_WIDTH, 40, 6).lineWidth(0.7).strokeColor(RULE).stroke();

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(closing.label, PAGE_MARGIN + 12, top + 14, { width: CONTENT_WIDTH - 24 });

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(INK)
    .text(closing.value, PAGE_MARGIN, top + 13, { width: CONTENT_WIDTH - 12, align: "right" });

  doc.y = top + 52;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function drawHeaderRow(doc: Doc, columns: ReportColumn[]): void {
  const top = doc.y;

  doc.rect(PAGE_MARGIN, top, CONTENT_WIDTH, 18).fillOpacity(0.06).fill(INK).fillOpacity(1);

  let left = PAGE_MARGIN;
  for (const column of columns) {
    const width = CONTENT_WIDTH * column.width;

    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(MUTED)
      .text(column.label.toUpperCase(), left + 6, top + 5.5, {
        width: width - 12,
        align: column.align ?? "left",
        characterSpacing: 0.4,
        lineBreak: false,
      });

    left += width;
  }

  doc.y = top + 22;
}

function drawRow(
  doc: Doc,
  columns: ReportColumn[],
  values: string[],
  style: { font: string; size: number; colour: string },
): void {
  const top = doc.y;
  let left = PAGE_MARGIN;

  columns.forEach((column, index) => {
    const width = CONTENT_WIDTH * column.width;

    doc
      .font(column.numeric ? "Helvetica" : style.font)
      .fontSize(style.size)
      .fillColor(style.colour)
      .text(values[index] ?? "", left + 6, top, {
        width: width - 12,
        align: column.align ?? "left",
        lineBreak: false,
        ellipsis: true,
      });

    left += width;
  });

  doc.y = top + 16;

  doc
    .moveTo(PAGE_MARGIN, doc.y - 4)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y - 4)
    .lineWidth(0.4)
    .strokeColor(RULE)
    .stroke();
}

function rule(doc: Doc): void {
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y)
    .lineWidth(0.7)
    .strokeColor(RULE)
    .stroke();
}

/**
 * Starts a new page when `needed` points would run past the footer.
 * Returns whether a page break happened, so a table can repeat its headings.
 */
function ensureSpace(doc: Doc, needed: number): boolean {
  if (doc.y + needed <= BOTTOM_LIMIT) return false;

  doc.addPage();
  doc.y = PAGE_MARGIN;
  return true;
}

/**
 * Writes the footer onto every buffered page, once the total is known.
 *
 * The generation timestamp is part of the record: these figures are derived at
 * request time, so a PDF is a snapshot rather than a stored document.
 */
function stampFooters(doc: Doc, input: ReportPdfInput): void {
  const range = doc.bufferedPageRange();
  const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 16);

  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);

    doc
      .moveTo(PAGE_MARGIN, FOOTER_RULE_Y)
      .lineTo(PAGE_MARGIN + CONTENT_WIDTH, FOOTER_RULE_Y)
      .lineWidth(0.5)
      .strokeColor(RULE)
      .stroke();

    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(
        `${input.companyName} · ${input.title} · generated ${generatedAt} UTC from posted journal entries`,
        PAGE_MARGIN,
        FOOTER_BASELINE,
        { width: CONTENT_WIDTH * 0.75, lineBreak: false, height: 12 },
      );

    doc.text(`Page ${index + 1} of ${range.count}`, PAGE_MARGIN, FOOTER_BASELINE, {
      width: CONTENT_WIDTH,
      align: "right",
      lineBreak: false,
      height: 12,
    });
  }
}
