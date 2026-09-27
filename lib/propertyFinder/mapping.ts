import type { PropertyCategory, BedroomCount, Furnished } from "@prisma/client";
import { isResidentialCategory } from "@/lib/propertyCategory";

// Property Finder's own `type` enum value for each of our property
// categories, transcribed from the Enterprise API's Qatar allowed-types
// table. `category` (residential/commercial) reuses the app's existing
// isResidentialCategory split (lib/propertyCategory.ts) rather than
// duplicating that judgment call - WHOLE_BUILDING and LAND are already
// treated as non-residential there, which happens to match how Qatar's PF
// table lists them (both categories accept them, so either classification is
// valid; residential-vs-commercial elsewhere in this app already decided
// non-residential for these two).
export const PF_PROPERTY_TYPE: Record<PropertyCategory, string> = {
  APARTMENT: "apartment",
  VILLA: "villa",
  TOWNHOUSE: "townhouse",
  PENTHOUSE: "penthouse",
  DUPLEX: "duplex",
  COMPOUND_VILLA: "compound",
  WHOLE_BUILDING: "whole-building",
  OFFICE: "office-space",
  RETAIL: "retail",
  LAND: "land",
};

export function pfCategoryAndType(category: PropertyCategory): { category: "residential" | "commercial"; type: string } {
  return {
    category: isResidentialCategory(category) ? "residential" : "commercial",
    type: PF_PROPERTY_TYPE[category],
  };
}

// Property Finder has no "+ maid" concept - a maid's room is mapped as one
// extra bedroom. This is a judgment call, not a confirmed PF rule; revisit if
// it causes rejections or looks wrong on published listings.
export const PF_BEDROOMS: Record<BedroomCount, string> = {
  STUDIO: "studio",
  ONE: "1",
  TWO: "2",
  TWO_PLUS_MAID: "3",
  THREE: "3",
  THREE_PLUS_MAID: "4",
  FOUR: "4",
  FOUR_PLUS_MAID: "5",
  FIVE: "5",
  FIVE_PLUS_MAID: "6",
  SIX_PLUS: "6",
};

export const PF_FURNISHING_TYPE: Record<Furnished, string> = {
  FURNISHED: "furnished",
  UNFURNISHED: "unfurnished",
};

// PF's own bathrooms enum ("none", "1".."20") - stored directly in
// Listing.bathrooms. The UI offers a plain number input rather than
// suggesting all 21 values, so these two helpers translate between what's
// typed (a number, "" when empty) and PF's stored string shape.
export const PF_BATHROOM_OPTIONS = [
  "none",
  ...Array.from({ length: 20 }, (_, i) => String(i + 1)),
];

export function bathroomsToInputValue(pfValue: string | null | undefined): string {
  if (!pfValue) return "";
  return pfValue === "none" ? "0" : pfValue;
}

export function bathroomsFromInputValue(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const n = Math.floor(Number(trimmed));
  if (Number.isNaN(n)) return null;
  const clamped = Math.max(0, Math.min(20, n));
  return clamped === 0 ? "none" : String(clamped);
}

// Qatar's allowed-amenities table from the Enterprise API docs, keyed by our
// own PropertyCategory (each maps to exactly one PF category+type combo, see
// pfCategoryAndType above, so keying here avoids re-deriving that mapping).
const QATAR_RESIDENTIAL_AMENITIES = [
  "central-ac",
  "built-in-wardrobes",
  "kitchen-appliances",
  "security",
  "concierge",
  "maid-service",
  "balcony",
  "private-gym",
  "shared-gym",
  "private-jacuzzi",
  "shared-spa",
  "covered-parking",
  "maids-room",
  "study",
  "childrens-play-area",
  "pets-allowed",
  "barbecue-area",
  "shared-pool",
  "childrens-pool",
  "private-garden",
  "private-pool",
  "view-of-water",
  "view-of-landmark",
  "walk-in-closet",
  "lobby-in-building",
];

const QATAR_COMMERCIAL_AMENITIES = [
  "central-ac",
  "security",
  "balcony",
  "shared-gym",
  "covered-parking",
  "networked",
  "shared-pool",
  "private-garden",
  "private-pool",
  "view-of-water",
  "dining-in-building",
  "conference-room",
  "lobby-in-building",
];

export const QATAR_ALLOWED_AMENITIES: Record<PropertyCategory, string[]> = {
  APARTMENT: QATAR_RESIDENTIAL_AMENITIES,
  VILLA: QATAR_RESIDENTIAL_AMENITIES,
  TOWNHOUSE: QATAR_RESIDENTIAL_AMENITIES,
  PENTHOUSE: QATAR_RESIDENTIAL_AMENITIES,
  DUPLEX: QATAR_RESIDENTIAL_AMENITIES,
  COMPOUND_VILLA: QATAR_RESIDENTIAL_AMENITIES,
  WHOLE_BUILDING: QATAR_COMMERCIAL_AMENITIES,
  OFFICE: QATAR_COMMERCIAL_AMENITIES,
  RETAIL: QATAR_COMMERCIAL_AMENITIES,
  LAND: [], // Land/Farm listings accept no amenities on Property Finder
};

// Drops any amenity we might have stored that PF doesn't allow for this
// property's category, so we never submit a combination PF will 422 on.
export function filterAmenitiesForCategory(category: PropertyCategory, amenities: string[]): string[] {
  const allowed = new Set(QATAR_ALLOWED_AMENITIES[category]);
  return amenities.filter((a) => allowed.has(a));
}

// Human-readable labels for Property Finder's amenity enum, for the amenity
// picker UI - covers every value across both the residential and commercial
// Qatar amenity lists above.
export const AMENITY_LABELS: Record<string, string> = {
  "central-ac": "Central A/C",
  "built-in-wardrobes": "Built-in Wardrobes",
  "kitchen-appliances": "Kitchen Appliances",
  security: "Security",
  concierge: "Concierge",
  "maid-service": "Maid Service",
  balcony: "Balcony",
  "private-gym": "Private Gym",
  "shared-gym": "Shared Gym",
  "private-jacuzzi": "Private Jacuzzi",
  "shared-spa": "Shared Spa",
  "covered-parking": "Covered Parking",
  "maids-room": "Maid's Room",
  study: "Study Room",
  "childrens-play-area": "Children's Play Area",
  "pets-allowed": "Pets Allowed",
  "barbecue-area": "Barbecue Area",
  "shared-pool": "Shared Pool",
  "childrens-pool": "Children's Pool",
  "private-garden": "Private Garden",
  "private-pool": "Private Pool",
  "view-of-water": "View of Water",
  "view-of-landmark": "View of Landmark",
  "walk-in-closet": "Walk-in Closet",
  "lobby-in-building": "Lobby in Building",
  networked: "Networked",
  "dining-in-building": "Dining in Building",
  "conference-room": "Conference Room",
};

// Amenity options for a category's picker UI, in a stable, sensible order.
export function amenityOptionsFor(category: PropertyCategory): { label: string; value: string }[] {
  return QATAR_ALLOWED_AMENITIES[category].map((value) => ({ value, label: AMENITY_LABELS[value] ?? value }));
}
