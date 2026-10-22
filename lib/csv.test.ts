import { describe, it, expect } from "vitest";
import { csvCell } from "./csv";
import { safeCallbackPath } from "./safeRedirect";

describe("csvCell", () => {
  it("quotes and doubles quotes", () => expect(csvCell('say "hi"')).toBe('"say ""hi"""'));
  it("keeps spreadsheet formulas from running", () => {
    for (const evil of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", '=HYPERLINK("http://evil","x")', "\t=1", "\r=1"]) expect(csvCell(evil).startsWith(`"'`)).toBe(true);
  });
  it("leaves ordinary text, numbers and empty values alone", () => {
    expect(csvCell("Ali Khan")).toBe('"Ali Khan"');
    expect(csvCell(12)).toBe('"12"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell("a-b = c")).toBe('"a-b = c"');
  });
});

describe("safeCallbackPath", () => {
  it("allows addresses inside the app", () => {
    expect(safeCallbackPath("/leads?stage=new", "/")).toBe("/leads?stage=new");
    expect(safeCallbackPath("/property/12", "/")).toBe("/property/12");
  });
  it("sends everything else to the fallback", () => {
    for (const bad of ["https://evil.example", "http://evil.example/x", "//evil.example", String.raw`/\evil.example`, "javascript:alert(1)", "evil.example", "", null, undefined, "/ok\nSet-Cookie: x=1"]) {
      expect(safeCallbackPath(bad as string | null | undefined, "/dashboard")).toBe("/dashboard");
    }
  });
});
