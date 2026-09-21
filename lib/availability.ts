import { AvailabilityStatus, ListingType } from "./types";

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  RENTED: "Rented",
  SOLD: "Sold",
};

export const AVAILABILITY_COLORS: Record<AvailabilityStatus, { bg: string; text: string }> = {
  AVAILABLE: { bg: "var(--success-bg)", text: "var(--success)" },
  RESERVED: { bg: "#fff4e0", text: "#b4650a" },
  RENTED: { bg: "var(--surface-muted)", text: "var(--muted)" },
  SOLD: { bg: "var(--surface-muted)", text: "var(--muted)" },
};

// RENT listings can be Available / Reserved / Rented.
// SALE listings can be Available / Reserved / Sold.
export function availabilityOptionsFor(listingType: ListingType): AvailabilityStatus[] {
  return listingType === "RENT" ? ["AVAILABLE", "RESERVED", "RENTED"] : ["AVAILABLE", "RESERVED", "SOLD"];
}
