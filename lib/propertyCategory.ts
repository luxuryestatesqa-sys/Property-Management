import { PropertyCategory, BedroomCount } from "./types";

export const PROPERTY_CATEGORY_LABELS: Record<PropertyCategory, string> = {
  APARTMENT: "Apartment",
  VILLA: "Villa",
  TOWNHOUSE: "Townhouse",
  PENTHOUSE: "Penthouse",
  DUPLEX: "Duplex",
  COMPOUND_VILLA: "Compound Villa",
  WHOLE_BUILDING: "Whole Building",
  OFFICE: "Office",
  RETAIL: "Retail / Shop",
  LAND: "Land",
};

export const PROPERTY_CATEGORY_OPTIONS = Object.keys(PROPERTY_CATEGORY_LABELS) as PropertyCategory[];

// Categories that take a bedroom count. A whole building, office, retail
// unit, or plot of land isn't described by a single bedroom count.
const RESIDENTIAL_CATEGORIES = new Set<PropertyCategory>([
  "APARTMENT",
  "VILLA",
  "TOWNHOUSE",
  "PENTHOUSE",
  "DUPLEX",
  "COMPOUND_VILLA",
]);

export function isResidentialCategory(category: PropertyCategory): boolean {
  return RESIDENTIAL_CATEGORIES.has(category);
}

export const BEDROOM_LABELS: Record<BedroomCount, string> = {
  STUDIO: "Studio",
  ONE: "1 Bedroom",
  TWO: "2 Bedroom",
  TWO_PLUS_MAID: "2 + Maid",
  THREE: "3 Bedroom",
  THREE_PLUS_MAID: "3 + Maid",
  FOUR: "4 Bedroom",
  FOUR_PLUS_MAID: "4 + Maid",
  FIVE: "5 Bedroom",
  FIVE_PLUS_MAID: "5 + Maid",
  SIX_PLUS: "6+ Bedroom",
};

// Short form for tight spaces like property cards.
export const BEDROOM_SHORT_LABELS: Record<BedroomCount, string> = {
  STUDIO: "Studio",
  ONE: "1 BR",
  TWO: "2 BR",
  TWO_PLUS_MAID: "2 BR + Maid",
  THREE: "3 BR",
  THREE_PLUS_MAID: "3 BR + Maid",
  FOUR: "4 BR",
  FOUR_PLUS_MAID: "4 BR + Maid",
  FIVE: "5 BR",
  FIVE_PLUS_MAID: "5 BR + Maid",
  SIX_PLUS: "6+ BR",
};

export const BEDROOM_OPTIONS = Object.keys(BEDROOM_LABELS) as BedroomCount[];
