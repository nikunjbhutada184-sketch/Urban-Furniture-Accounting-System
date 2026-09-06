import { describe, expect, it } from "vitest";
import { csvFileName, renderCsv } from "@/modules/reporting/csv";

/**
 * CSV rendering.
 *
 * Two things have to hold: a spreadsheet must read the amounts as numbers, and
 * a value that looks like a formula must not be executed when someone opens the
 * file. The second is a real vulnerability class (CSV injection), not a
 * nicety — an account named `=cmd|...` would otherwise run on open.
 */

describe("renderCsv", () => {
  it("writes the title, the meta rows and the table", () => {
    const csv = renderCsv({
      title: "Trial Balance",
      meta: [["From", "2026-04-01"]],
      sections: [
        {
          headers: ["Code", "Account", "Debit"],
          rows: [["1000", "Cash", "500.00"]],
          footer: ["", "Total", "500.00"],
        },
      ],
    });

    expect(csv.split("\r\n")).toEqual([
      "Trial Balance",
      "From,2026-04-01",
      "",
      "Code,Account,Debit",
      "1000,Cash,500.00",
      ",Total,500.00",
      "",
    ]);
  });

  it("leaves amounts unquoted so a spreadsheet reads them as numbers", () => {
    const csv = renderCsv({
      title: "T",
      sections: [{ headers: ["Amount"], rows: [["1234.56"], ["-99.00"]] }],
    });

    expect(csv).toContain("1234.56");
    expect(csv).not.toContain('"1234.56"');
    // A negative number must stay numeric, not be guarded as a formula.
    expect(csv).toContain("-99.00");
    expect(csv).not.toContain("'-99.00");
  });

  it("quotes a field containing a comma", () => {
    const csv = renderCsv({
      title: "T",
      sections: [{ headers: ["Name"], rows: [["Desai, Priya"]] }],
    });

    expect(csv).toContain('"Desai, Priya"');
  });

  it("doubles an embedded quote", () => {
    const csv = renderCsv({
      title: "T",
      sections: [{ headers: ["Name"], rows: [['The "Big" Chair']] }],
    });

    expect(csv).toContain('"The ""Big"" Chair"');
  });

  it("neutralises a value that a spreadsheet would treat as a formula", () => {
    const csv = renderCsv({
      title: "T",
      sections: [
        {
          headers: ["Name"],
          rows: [["=1+1"], ["+SUM(A1)"], ["@import"], ["-lookup"]],
        },
      ],
    });

    // Each is prefixed with an apostrophe so it opens as text, never as code.
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'+SUM(A1)");
    expect(csv).toContain("'@import");
    expect(csv).toContain("'-lookup");
  });

  it("uses CRLF line endings, as the CSV convention expects", () => {
    const csv = renderCsv({ title: "T", sections: [] });
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

describe("csvFileName", () => {
  it("names the file after the report and its period", () => {
    expect(
      csvFileName("customer-ageing", {
        from: new Date("2026-04-01"),
        to: new Date("2027-03-31"),
      }),
    ).toBe("customer-ageing_2026-04-01_to_2027-03-31.csv");
  });
});
