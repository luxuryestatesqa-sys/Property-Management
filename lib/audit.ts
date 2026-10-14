import { AuditLogDTO, AvailabilityStatus, PropertyCategory, BedroomCount } from "./types";
import { formatQAR, formatSqm } from "./format";
import { AVAILABILITY_LABELS } from "./availability";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_LABELS } from "./propertyCategory";

const LABELS: Record<string, string> = {
  CREATED: "Listing created",
  DEACTIVATED: "Listing deactivated",
  REACTIVATED: "Listing reactivated",
  PROPERTY_CATEGORY_CHANGED: "Property type",
  BEDROOMS_CHANGED: "Bedrooms",
  SIZE_CHANGED: "Size",
  AREA_CHANGED: "Location",
  COMMUNITY_CHANGED: "Area/Community",
  BUILDING_CHANGED: "Building name",
  FLOOR_CHANGED: "Floor",
  APARTMENT_CHANGED: "Apartment number",
  FURNISHED_CHANGED: "Furnished status",
  BILLS_CHANGED: "Bills status",
  RENT_PRICE_CHANGED: "Rent price",
  SALE_PRICE_CHANGED: "Sale price",
  RENTAL_VALUE_CHANGED: "Rental value",
  AVAILABILITY_STATUS_CHANGED: "Availability status",
  PHOTOS_CHANGED: "Photos",
  UNIT_DETAILS_PRIVACY_CHANGED: "Floor & unit number visibility",
  PROPERTY_FINDER_LOCATION_CHANGED: "Property Finder location",
  AMENITIES_CHANGED: "Amenities",
  TITLE_CHANGED: "Title",
  DESCRIPTION_CHANGED: "Description",
  TITLE_AR_CHANGED: "Arabic title",
  DESCRIPTION_AR_CHANGED: "Arabic description",
  VISIBILITY_CHANGED: "Who can see it",
};

// A field with no previous value is recorded as this literal sentinel (see
// api routes' trackChange helper: `String(oldVal ?? "-")`).
const UNSET = "-";

function numericFormatter(format: (n: number) => string) {
  return (raw: string) => {
    if (raw === UNSET) return UNSET;
    const n = Number(raw);
    return Number.isNaN(n) ? raw : format(n);
  };
}

// Per-action value formatters, applied to raw oldValue/newValue strings.
const VALUE_FORMATTERS: Record<string, (raw: string) => string> = {
  RENT_PRICE_CHANGED: numericFormatter(formatQAR),
  SALE_PRICE_CHANGED: numericFormatter(formatQAR),
  RENTAL_VALUE_CHANGED: numericFormatter(formatQAR),
  SIZE_CHANGED: numericFormatter(formatSqm),
  AVAILABILITY_STATUS_CHANGED: (raw) => AVAILABILITY_LABELS[raw as AvailabilityStatus] ?? raw,
  PROPERTY_CATEGORY_CHANGED: (raw) => PROPERTY_CATEGORY_LABELS[raw as PropertyCategory] ?? raw,
  BEDROOMS_CHANGED: (raw) => BEDROOM_LABELS[raw as BedroomCount] ?? raw,
  UNIT_DETAILS_PRIVACY_CHANGED: (raw) => (raw === "true" ? "Only me" : "Everyone"),
};

// Readable name for an audit action ("RENT_PRICE_CHANGED" -> "Rent price").
export function auditLabel(action: string): string {
  if (LABELS[action]) return LABELS[action];
  const t = action.replace(/_(CHANGED|UPDATED)$/, "").replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Readable old/new value for an audit action (prices as QAR, enums as their labels).
export function formatAuditValue(action: string, raw: string): string {
  const f = VALUE_FORMATTERS[action];
  if (f) return f(raw);
  // ENUM_LIKE values ("SEMI_FURNISHED") read as words; free text is shortened.
  const t = /^[A-Z][A-Z0-9_]*$/.test(raw) ? humanize(raw) : raw;
  return t.length > 70 ? `${t.slice(0, 67)}…` : t;
}

const humanize = (id: string) => {
  const t = id.trim().replace(/[-_]+/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// "Amenities: +Central ac, +Gym · -Pets" instead of two raw id lists.
function amenityDiff(oldValue: string | null, newValue: string | null): string {
  const list = (v: string | null) => (v && v !== UNSET ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);
  const before = list(oldValue);
  const after = list(newValue);
  const show = (items: string[], sign: string) => (items.length > 3 ? `${items.slice(0, 3).map((x) => sign + x).join(", ")} +${items.length - 3} more` : items.map((x) => sign + x).join(", "));
  const added = after.filter((x) => !before.includes(x)).map(humanize);
  const removed = before.filter((x) => !after.includes(x)).map(humanize);
  const parts = [added.length ? show(added, "+") : "", removed.length ? show(removed, "-") : ""].filter(Boolean);
  return parts.length ? `Amenities: ${parts.join(" · ")}` : "Amenities updated";
}

// One readable sentence for a recorded change of one field.
export function describeChange(action: string, oldValue: string | null, newValue: string | null): string {
  if (action === "CREATED") return "Listing created";
  if (action === "DEACTIVATED") return "Listing deactivated";
  if (action === "REACTIVATED") return "Listing reactivated";
  if (action === "PRIVATE_DETAILS_UPDATED") return "Private details updated";
  if (action === "AMENITIES_CHANGED") return amenityDiff(oldValue, newValue);
  const label = auditLabel(action);
  const isCode = (v: string | null) => v !== null && /^\d+$/.test(v) && !/PRICE|VALUE|SIZE|BEDROOMS|FLOOR|YEARS|PAYMENT/.test(action);
  // Location ids and similar codes mean nothing to a person, so just say it changed.
  if (isCode(oldValue) || isCode(newValue) || (!oldValue && !newValue)) return `${label} updated`;
  const fmt = (v: string | null) => (v && v !== UNSET ? formatAuditValue(action, v) : "none");
  return `${label}: ${fmt(oldValue)} → ${fmt(newValue)}`;
}

export function describeAuditEntry(entry: AuditLogDTO): string {
  return describeChange(entry.action, entry.oldValue ?? null, entry.newValue ?? null);
}
