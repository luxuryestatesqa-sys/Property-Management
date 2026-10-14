// Turns whatever extra information a lead arrived with into label/value rows for the lead page,
// whatever the source: Property Finder seller info, Meta (Facebook/Instagram) lead-form answers,
// or fields from a future source. Nothing here is source-specific in the UI, so a new field
// shows up on its own.

export interface LeadDetail {
  label: string;
  value: string;
}

// Already shown in the Contact card or the header.
const SHOWN_ELSEWHERE = new Set(["name", "full_name", "first_name", "last_name", "email", "email_address", "phone", "phone_number", "mobile", "whatsapp", "id", "leadgen_id", "lead_id"]);

// Extra context Meta sends with a lead.
const META_CONTEXT: [string, string][] = [
  ["form_name", "Form"],
  ["campaign_name", "Campaign"],
  ["adset_name", "Ad set"],
  ["ad_name", "Ad"],
  ["platform", "Platform"],
];

const norm = (k: string) =>
  k
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

export function prettyLabel(key: string): string {
  // Identifiers (snake_case, camelCase) become sentence case; real questions keep their own capitals.
  const identifier = !/\s/.test(key.trim());
  let s = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (identifier) s = s.toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key;
}

function formatValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    // Lead-form answers like "🏡_family_home" or "💳_installment_plan": drop the emoji, spaces for underscores.
    if (!/\s/.test(t) && t.includes("_")) {
      const words = t.replace(/[^\p{L}\p{N}_]/gu, "").replace(/_+/g, " ").trim();
      if (words) return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 500);
    }
    return t.slice(0, 500);
  }
  if (Array.isArray(v)) {
    const parts = v.map(formatValue).filter((x): x is string => Boolean(x));
    return parts.length ? parts.join(", ").slice(0, 500) : null;
  }
  return null; // nested objects are skipped
}

function fromObject(obj: Record<string, unknown>, out: LeadDetail[]) {
  for (const [k, v] of Object.entries(obj)) {
    if (SHOWN_ELSEWHERE.has(norm(k))) continue;
    const value = formatValue(v);
    if (value) out.push({ label: prettyLabel(k), value });
  }
}

export function extractLeadDetails(input: { sellerProperty?: unknown; raw?: unknown }): LeadDetail[] {
  const out: LeadDetail[] = [];
  const isObj = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x);

  if (isObj(input.sellerProperty)) fromObject(input.sellerProperty, out);

  const raw = isObj(input.raw) ? input.raw : null;
  if (raw) {
    // Meta lead forms: [{ name: "what_is_your_budget?", values: ["QAR 5,000"] }]
    const answers = raw.field_data ?? raw.fieldData ?? raw.answers;
    if (Array.isArray(answers)) {
      for (const a of answers) {
        if (!isObj(a) || typeof a.name !== "string" || SHOWN_ELSEWHERE.has(norm(a.name))) continue;
        const value = formatValue(a.values ?? a.value);
        if (value) out.push({ label: prettyLabel(a.name), value });
      }
    }
    // A plain { question: answer } object.
    if (isObj(raw.fields)) fromObject(raw.fields, out);
    for (const [key, label] of META_CONTEXT) {
      const value = formatValue(raw[key]);
      if (value) out.push({ label, value });
    }
  }

  const seen = new Set<string>();
  return out.filter((d) => {
    const k = `${d.label.toLowerCase()}|${d.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
