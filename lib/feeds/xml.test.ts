import { describe, it, expect } from "vitest";
import { escapeXml, xmlTag, cdataTag } from "./xml";

describe("escapeXml", () => {
  it("escapes the five reserved XML characters", () => {
    expect(escapeXml(`<a> & "b" 'c'`)).toBe("&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos;");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeXml("Marina Tower 5")).toBe("Marina Tower 5");
  });
});

describe("xmlTag", () => {
  it("wraps a value in the given tag", () => {
    expect(xmlTag("price", 9500)).toBe("<price>9500</price>");
  });

  it("escapes reserved characters inside the value", () => {
    expect(xmlTag("title", "Tom & Jerry's")).toBe("<title>Tom &amp; Jerry&apos;s</title>");
  });

  it("self-closes for null, undefined, or empty string", () => {
    expect(xmlTag("bedrooms", null)).toBe("<bedrooms/>");
    expect(xmlTag("bedrooms", undefined)).toBe("<bedrooms/>");
    expect(xmlTag("bedrooms", "")).toBe("<bedrooms/>");
  });
});

describe("cdataTag", () => {
  it("wraps text in a CDATA section, unescaped", () => {
    expect(cdataTag("description", "2BR with <great> views & a pool")).toBe(
      "<description><![CDATA[2BR with <great> views & a pool]]></description>"
    );
  });

  it("self-closes for null or empty string", () => {
    expect(cdataTag("description", null)).toBe("<description/>");
    expect(cdataTag("description", "")).toBe("<description/>");
  });
});
