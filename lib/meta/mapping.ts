import type { GraphLead } from "./graph";
import { normalizeEmail, normalizePhone } from "@/lib/leads/csv";

// Turns what Meta sends for a lead-form submission into the fields a lead has here.

export interface MetaLeadFields {
  externalId: string;
  name: string;
  phone: string | null;
  email: string | null;
  region: string | null;
  receivedAt: Date;
  platformLabel: string; // Facebook | Instagram
}

const norm = (k: string) => k.toLowerCase().replace(/[\s-]+/g, "_");

// Meta writes phone numbers as "p:+97455500001" in some exports.
const cleanValue = (v: string) => v.replace(/^p:/i, "").trim();

export function platformLabel(platform?: string): string {
  const p = (platform ?? "").toLowerCase();
  return p === "ig" || p === "instagram" ? "Instagram" : p === "fb" || p === "facebook" ? "Facebook" : "Facebook / Instagram";
}

export function normalizeMetaLead(lead: GraphLead): MetaLeadFields {
  const fields = new Map<string, string>();
  for (const f of lead.field_data ?? []) {
    const v = cleanValue((f.values ?? []).join(", "));
    if (f.name && v) fields.set(norm(f.name), v);
  }
  const first = (...keys: string[]) => keys.map((k) => fields.get(k)).find(Boolean);
  const full = first("full_name", "name") ?? [first("first_name"), first("last_name")].filter(Boolean).join(" ");
  const phone = normalizePhone(first("phone_number", "phone", "mobile_number", "work_phone_number"));
  const email = normalizeEmail(first("email", "work_email"));
  // The area they care about: the form's city question, or a custom question about area/location.
  const customArea = [...fields.entries()].find(([k]) => /(^|_)(area|location|community|neighbou?rhood)(_|$)/.test(k))?.[1];
  const region = first("city", "preferred_area", "area", "location") ?? customArea ?? first("state", "province") ?? null;
  const created = lead.created_time ? new Date(lead.created_time) : new Date();

  return {
    externalId: lead.id,
    name: (full || phone || email || "Facebook lead").slice(0, 120),
    phone,
    email,
    region: region ? region.slice(0, 120) : null,
    receivedAt: Number.isNaN(created.getTime()) ? new Date() : created,
    platformLabel: platformLabel(lead.platform),
  };
}

// What we keep on the lead so the "Enquiry details" card can show every answer and where it came from.
export function metaRaw(lead: GraphLead, extra: { formName?: string | null; pageName?: string }) {
  return {
    field_data: lead.field_data ?? [],
    form_name: extra.formName ?? undefined,
    campaign_name: lead.campaign_name,
    adset_name: lead.adset_name,
    ad_name: lead.ad_name,
    platform: platformLabel(lead.platform),
    page_name: extra.pageName,
    is_organic: lead.is_organic,
    form_id: lead.form_id,
    ad_id: lead.ad_id,
  };
}
