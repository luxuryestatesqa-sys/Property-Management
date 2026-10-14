// Helpers for adding leads by hand and importing them from a CSV or Excel file. Pure functions,
// shared by the import screen (in the browser) and the server.

export type ImportField = "name" | "lastName" | "phone" | "email" | "region" | "notes" | "date";

export const IMPORT_FIELDS: { key: ImportField; label: string; hint: string }[] = [
  { key: "name", label: "Name", hint: "Or first name" },
  { key: "lastName", label: "Last name", hint: "Optional, added after the name" },
  { key: "phone", label: "Phone", hint: "Include the country code, e.g. +974…" },
  { key: "email", label: "Email", hint: "" },
  { key: "region", label: "Area", hint: "Location the lead is interested in" },
  { key: "notes", label: "Notes", hint: "Saved as a note on the lead" },
  { key: "date", label: "Date received", hint: "Defaults to today" },
];

// Words that usually name each column in an export (Meta lead ads, Property Finder, Bayut, Excel sheets…).
const SYNONYMS: Record<ImportField, string[]> = {
  name: ["name", "full name", "fullname", "full_name", "client", "client name", "customer", "customer name", "lead name", "contact name", "first name", "firstname", "first_name"],
  lastName: ["last name", "lastname", "last_name", "surname", "family name"],
  phone: ["phone", "phone number", "phone_number", "mobile", "mobile number", "mobile no", "whatsapp", "whatsapp number", "contact", "contact number", "tel", "telephone", "cell"],
  email: ["email", "e-mail", "email address", "email_address", "mail"],
  region: ["area", "location", "region", "community", "city", "district", "preferred area", "preferred location"],
  notes: ["notes", "note", "comment", "comments", "message", "remarks", "description", "details", "requirement", "requirements"],
  date: ["date", "created", "created at", "created_at", "created time", "created_time", "received", "received at", "date received", "enquiry date", "timestamp"],
};

const squash = (s: string) => s.toLowerCase().replace(/[\s_\-.]+/g, " ").trim();

// For each field, the index of the column that looks like it (or -1). A column is used once.
export function suggestMapping(headers: string[]): Record<ImportField, number> {
  const out = {} as Record<ImportField, number>;
  const used = new Set<number>();
  const heads = headers.map(squash);
  for (const f of Object.keys(SYNONYMS) as ImportField[]) {
    let found = -1;
    for (const word of SYNONYMS[f].map(squash)) {
      const i = heads.findIndex((h, idx) => !used.has(idx) && h === word);
      if (i >= 0) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      // A header that merely contains the word, e.g. "Customer phone".
      for (const word of SYNONYMS[f].map(squash)) {
        const i = heads.findIndex((h, idx) => !used.has(idx) && h.length > 0 && h.includes(word) && word.length >= 4);
        if (i >= 0) {
          found = i;
          break;
        }
      }
    }
    if (found >= 0) used.add(found);
    out[f] = found;
  }
  return out;
}

// Reads CSV text into rows of cells. Handles quotes, commas inside quotes, doubled quotes,
// Windows line breaks, a leading BOM, and files separated by ; or tabs instead of commas.
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function templateCsv(): string {
  return ["Name,Phone,Email,Area,Notes,Date", 'Sara Ali,+97455500001,sara@example.com,Lusail,"Looking for a 2 bedroom, budget 8,000",2026-10-11'].join("\r\n");
}

// "+974 5550-0001", "00974 5550 0001" -> "+97455500001". Without a country code the digits are kept as typed.
export function normalizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\.0+$/, ""); // Excel turns numbers into "97455500001.0"
  const plus = s.startsWith("+") || s.startsWith("00");
  const digits = s.replace(/\D/g, "").replace(/^00/, "");
  if (digits.length < 6 || digits.length > 15) return null;
  return plus ? `+${digits}` : digits;
}

// Where a hand-added or imported lead came from. One choice sets both the channel and the label shown.
export const LEAD_ORIGINS = [
  { key: "OTHER", label: "Other / not sure", channel: "OTHER", sourceLabel: "Manual entry" },
  { key: "WHATSAPP", label: "WhatsApp", channel: "WHATSAPP", sourceLabel: "WhatsApp" },
  { key: "CALL", label: "Phone call", channel: "CALL", sourceLabel: "Phone call" },
  { key: "EMAIL", label: "Email", channel: "EMAIL", sourceLabel: "Email" },
  { key: "FACEBOOK", label: "Facebook", channel: "FORM", sourceLabel: "Facebook" },
  { key: "INSTAGRAM", label: "Instagram", channel: "FORM", sourceLabel: "Instagram" },
  { key: "PROPERTY_FINDER", label: "Property Finder", channel: "OTHER", sourceLabel: "Property Finder" },
  { key: "WEBSITE", label: "Website", channel: "FORM", sourceLabel: "Website" },
  { key: "REFERRAL", label: "Referral / walk-in", channel: "OTHER", sourceLabel: "Referral" },
] as const;

export function resolveOrigin(key: unknown) {
  return LEAD_ORIGINS.find((o) => o.key === key) ?? LEAD_ORIGINS[0];
}

// "Sara" + "Ali" -> "Sara Ali". Never repeats a name: a file whose first-name column already holds the
// full name ("Sara Ali" + "Ali") gives "Sara Ali", not "Sara Ali Ali".
export function joinName(first: string, last: string): string {
  const f = first.trim().replace(/\s+/g, " ");
  const l = last.trim().replace(/\s+/g, " ");
  if (!l) return f;
  if (!f) return l;
  const fl = f.toLowerCase();
  const ll = l.toLowerCase();
  if (fl === ll || fl.endsWith(` ${ll}`) || fl.startsWith(`${ll} `)) return f;
  return `${f} ${l}`;
}

// "Iqbal ahmed Iqbal ahmed" -> "Iqbal ahmed": a name that is the same words written twice.
export function collapseDoubledName(name: string): string {
  const w = name.trim().split(/\s+/);
  if (w.length < 2 || w.length % 2 !== 0) return name;
  const h = w.length / 2;
  return w.slice(0, h).join(" ").toLowerCase() === w.slice(h).join(" ").toLowerCase() ? w.slice(0, h).join(" ") : name;
}

export function normalizeEmail(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

// ISO ("2026-10-11", "2026-10-11T10:00:00Z"), day-first ("11/10/2026", "11-10-2026 14:30"), or a real Date.
export function parseReceivedAt(raw: unknown): Date | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const dm = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (dm) {
    const d = new Date(Number(dm[3]), Number(dm[2]) - 1, Number(dm[1]), Number(dm[4] ?? 0), Number(dm[5] ?? 0));
    return Number.isNaN(d.getTime()) || d.getMonth() !== Number(dm[2]) - 1 ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
