// Minimal, dependency-free XML escaping - the feeds emit a handful of fixed
// tag shapes (see formatters/), never user-supplied tag names, so a full XML
// builder library would be pure overhead here.

// Control characters that are illegal anywhere in an XML 1.0 document, even
// inside CDATA or as an escaped entity. One of these pasted into a title or
// description (it happens when text is copied from a PDF or chat app) would
// make the whole feed unparseable for the portal, so they're dropped.
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Empty values return "" (the tag is left out entirely) rather than an empty
// tag, which some importers read as a blank value that overwrites real data.
// Build a listing with joinTags so those blanks drop out.
export function xmlTag(tag: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return `<${tag}>${escapeXml(String(value))}</${tag}>`;
}

export function cdataTag(tag: string, value: string | null | undefined): string {
  const clean = value?.replace(INVALID_XML_CHARS, "");
  if (!clean) return "";
  // A literal "]]>" inside the text would end the CDATA section early and
  // produce invalid XML - split it across two sections instead.
  return `<${tag}><![CDATA[${clean.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]></${tag}>`;
}

export function joinTags(parts: string[]): string {
  return parts.filter((p) => p !== "").join("\n");
}
