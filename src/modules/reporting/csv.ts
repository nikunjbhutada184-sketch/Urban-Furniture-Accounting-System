/**
 * CSV export for the reports.
 *
 * Like the PDF layer, this only formats: every value handed to it is already a
 * string produced by a report service, so a spreadsheet and the screen cannot
 * disagree. Amounts are written unquoted and unformatted (no thousands
 * separators, a dot for the decimal point) so Excel and Sheets read them as
 * numbers rather than text.
 */

export interface CsvSection {
  /** Written as its own row above the table, e.g. "Income". */
  title?: string;
  headers: string[];
  rows: string[][];
  /** Emphasised row written under the table, e.g. a total. */
  footer?: string[];
}

/**
 * Escapes one field.
 *
 * A leading `=`, `+`, `-` or `@` makes a spreadsheet treat the cell as a
 * formula, so those are prefixed with a single quote. Plain negative numbers
 * are left alone -- they must stay numeric.
 */
function escapeField(value: string): string {
  const text = value ?? "";

  const isNumeric = /^-?\d+(\.\d+)?$/.test(text);
  const needsFormulaGuard = !isNumeric && /^[=+\-@\t\r]/.test(text);
  const guarded = needsFormulaGuard ? `'${text}` : text;

  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }

  return guarded;
}

function toRow(fields: string[]): string {
  return fields.map(escapeField).join(",");
}

/**
 * Renders a report as CSV.
 *
 * `\r\n` line endings, because that is what the CSV convention (RFC 4180) and
 * Excel both expect.
 */
export function renderCsv(input: {
  title: string;
  /** Context lines written above the data, e.g. the period. */
  meta?: string[][];
  sections: CsvSection[];
}): string {
  const lines: string[] = [toRow([input.title])];

  for (const meta of input.meta ?? []) {
    lines.push(toRow(meta));
  }

  for (const section of input.sections) {
    lines.push("");
    if (section.title) lines.push(toRow([section.title]));

    lines.push(toRow(section.headers));
    for (const row of section.rows) lines.push(toRow(row));
    if (section.footer) lines.push(toRow(section.footer));
  }

  return `${lines.join("\r\n")}\r\n`;
}

/** A filename that sorts chronologically and says what it contains. */
export function csvFileName(slug: string, period: { from: Date; to: Date }): string {
  const from = period.from.toISOString().slice(0, 10);
  const to = period.to.toISOString().slice(0, 10);
  return `${slug}_${from}_to_${to}.csv`;
}

/**
 * A downloadable CSV response.
 *
 * The UTF-8 byte-order mark is deliberate: without it Excel on Windows opens
 * the file in the system codepage and mangles any non-ASCII name.
 */
export function csvResponse(csv: string, fileName: string): Response {
  const body = `﻿${csv}`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
