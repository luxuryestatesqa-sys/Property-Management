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
};

export function describeAuditEntry(entry: AuditLogDTO): string {
  if (entry.action === "CREATED") return "Listing created";
  if (entry.action === "DEACTIVATED") return "Listing deactivated";
  if (entry.action === "REACTIVATED") return "Listing reactivated";
  // Deliberately doesn't record old/new values (see the PATCH route) - the
  // audit log is visible to anyone who can view the listing, not just its
  // owner/admin, so the private fields themselves never appear here.
  if (entry.action === "PRIVATE_DETAILS_UPDATED") return "Private details updated";

  const label = LABELS[entry.action] ?? entry.action;
  const formatter = VALUE_FORMATTERS[entry.action];
  const oldVal = entry.oldValue ? (formatter ? formatter(entry.oldValue) : entry.oldValue) : UNSET;
  const newVal = entry.newValue ? (formatter ? formatter(entry.newValue) : entry.newValue) : UNSET;
  return `${label} changed from ${oldVal} → ${newVal}`;
}
