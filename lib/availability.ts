import { AvailabilityStatus, ListingType } from "./types";

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  RENTED: "Rented",
  SOLD: "Sold",
};

export const AVAILABILITY_COLORS: Record<AvailabilityStatus, { bg: string; text: string }> = {
  AVAILABLE: { bg: "var(--success-bg)", text: "var(--success)" },
  RESERVED: { bg: "var(--warning-soft)", text: "var(--warning)" },
  RENTED: { bg: "var(--background)", text: "var(--text-muted)" },
  SOLD: { bg: "var(--background)", text: "var(--text-muted)" },
};

// RENT listings can be Available / Reserved / Rented.
// SALE listings can be Available / Reserved / Sold.
export function availabilityOptionsFor(listingType: ListingType): AvailabilityStatus[] {
  return listingType === "RENT" ? ["AVAILABLE", "RESERVED", "RENTED"] : ["AVAILABLE", "RESERVED", "SOLD"];
}
