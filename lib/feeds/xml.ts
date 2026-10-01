// Minimal, dependency-free XML escaping - the feeds emit a handful of fixed
// tag shapes (see formatters/), never user-supplied tag names, so a full XML
// builder library would be pure overhead here.
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function xmlTag(tag: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return `<${tag}/>`;
  return `<${tag}>${escapeXml(String(value))}</${tag}>`;
}

export function cdataTag(tag: string, value: string | null | undefined): string {
  if (!value) return `<${tag}/>`;
  return `<${tag}><![CDATA[${value}]]></${tag}>`;
}
