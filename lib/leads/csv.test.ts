import { describe, it, expect } from "vitest";
import { normalizeEmail, normalizePhone, parseCsv, parseReceivedAt, suggestMapping, templateCsv } from "./csv";

import { joinName, collapseDoubledName } from "./csv";

describe("names", () => {
  it("joins without repeating", () => {
    expect(joinName("Sara", "Ali")).toBe("Sara Ali");
    expect(joinName("Sara Ali", "Ali")).toBe("Sara Ali");
    expect(joinName("Sara Ali", "Sara Ali")).toBe("Sara Ali");
    expect(joinName("", "Ali")).toBe("Ali");
  });
  it("collapses a doubled name", () => {
    expect(collapseDoubledName("Iqbal ahmed Iqbal ahmed")).toBe("Iqbal ahmed");
    expect(collapseDoubledName("Ahmed Azib Riaz Ahmed Azib Riaz")).toBe("Ahmed Azib Riaz");
    expect(collapseDoubledName("Sara Ali")).toBe("Sara Ali");
  });
});

describe("parseCsv", () => {
  it("reads quotes, commas inside quotes, doubled quotes and Windows line breaks", () => {
    const rows = parseCsv('Name,Notes\r\n"Ali, Sr.","He said ""call me"""\r\nSara,plain\r\n');
    expect(rows).toEqual([["Name", "Notes"], ["Ali, Sr.", 'He said "call me"'], ["Sara", "plain"]]);
  });

  it("copes with a BOM, semicolons or tabs, and skips blank lines", () => {
    expect(parseCsv("﻿Name;Phone\nAli;123456\n\n")).toEqual([["Name", "Phone"], ["Ali", "123456"]]);
    expect(parseCsv("Name\tPhone\nAli\t123456")).toEqual([["Name", "Phone"], ["Ali", "123456"]]);
  });

  it("reads the example template it gives out", () => {
    const rows = parseCsv(templateCsv());
    expect(rows[0]).toEqual(["Name", "Phone", "Email", "Area", "Notes", "Date"]);
    expect(rows[1][4]).toBe("Looking for a 2 bedroom, budget 8,000");
  });
});

describe("suggestMapping", () => {
  it("matches common headings, including a Meta lead-ads export", () => {
    const m = suggestMapping(["created_time", "id", "ad_name", "full_name", "email", "phone_number", "what_is_your_budget?"]);
    expect(m.date).toBe(0);
    expect(m.name).toBe(3);
    expect(m.email).toBe(4);
    expect(m.phone).toBe(5);
    expect(m.region).toBe(-1);
  });

  it("matches first and last name separately and uses each column once", () => {
    const m = suggestMapping(["First Name", "Last Name", "Mobile", "Location", "Remarks"]);
    expect(m).toMatchObject({ name: 0, lastName: 1, phone: 2, region: 3, notes: 4, email: -1, date: -1 });
  });
});

describe("normalizePhone / normalizeEmail / parseReceivedAt", () => {
  it("cleans phone numbers and refuses junk", () => {
    expect(normalizePhone("+974 5550-0001")).toBe("+97455500001");
    expect(normalizePhone("00974 5550 0001")).toBe("+97455500001");
    expect(normalizePhone(97455500001)).toBe("97455500001");
    expect(normalizePhone("97455500001.0")).toBe("97455500001"); // Excel
    expect(normalizePhone("(555) 0001")).toBe("5550001");
    expect(normalizePhone("12")).toBeNull();
    expect(normalizePhone("n/a")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it("accepts only real-looking emails, lower-cased", () => {
    expect(normalizeEmail(" Sara@Example.COM ")).toBe("sara@example.com");
    expect(normalizeEmail("not an email")).toBeNull();
  });

  it("reads ISO and day-first dates, and refuses nonsense", () => {
    expect(parseReceivedAt("2026-10-11T10:00:00Z")?.toISOString()).toBe("2026-10-11T10:00:00.000Z");
    const d = parseReceivedAt("11/10/2026 14:30")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 11, 14, 30]);
    expect(parseReceivedAt("31/02/2026")).toBeNull();
    expect(parseReceivedAt("soon")).toBeNull();
    expect(parseReceivedAt("")).toBeNull();
  });
});
