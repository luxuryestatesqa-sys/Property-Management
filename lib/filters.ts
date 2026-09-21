import { PropertyCategory, BedroomCount } from "./types";

export interface Filters {
  listingType: "ALL" | "RENT" | "SALE";
  propertyCategory: PropertyCategory | null;
  bedrooms: BedroomCount | null;
  area: string | null;
  community: string | null;
  building: string | null;
  rentMin: number | null;
  rentMax: number | null;
  saleMin: number | null;
  saleMax: number | null;
  furnished: "ALL" | "FURNISHED" | "UNFURNISHED";
  bills: "ALL" | "INCLUDED" | "EXCLUDED";
  agentId: string | null;
  status: "ACTIVE" | "INACTIVE" | "ALL";
  availability: "ALL" | "AVAILABLE" | "RESERVED" | "RENTED" | "SOLD";
}

export const RENT_BOUNDS = { min: 2000, max: 30000, step: 500 };
export const SALE_BOUNDS = { min: 500000, max: 10000000, step: 50000 };

export const DEFAULT_FILTERS: Filters = {
  listingType: "ALL",
  propertyCategory: null,
  bedrooms: null,
  area: null,
  community: null,
  building: null,
  rentMin: null,
  rentMax: null,
  saleMin: null,
  saleMax: null,
  furnished: "ALL",
  bills: "ALL",
  agentId: null,
  status: "ACTIVE",
  availability: "ALL",
};

export function countActiveFilters(f: Filters): number {
  let count = 0;
  if (f.listingType !== "ALL") count++;
  if (f.propertyCategory) count++;
  if (f.bedrooms) count++;
  if (f.area) count++;
  if (f.community) count++;
  if (f.building) count++;
  if (f.rentMin !== null || f.rentMax !== null) count++;
  if (f.saleMin !== null || f.saleMax !== null) count++;
  if (f.furnished !== "ALL") count++;
  if (f.bills !== "ALL") count++;
  if (f.agentId) count++;
  if (f.status !== "ACTIVE") count++;
  if (f.availability !== "ALL") count++;
  return count;
}

export function filtersToParams(f: Filters, extra?: Record<string, string>): URLSearchParams {
  const p = new URLSearchParams();
  if (f.listingType !== "ALL") p.set("listingType", f.listingType);
  if (f.propertyCategory) p.set("propertyCategory", f.propertyCategory);
  if (f.bedrooms) p.set("bedrooms", f.bedrooms);
  if (f.area) p.set("area", f.area);
  if (f.community) p.set("community", f.community);
  if (f.building) p.set("building", f.building);
  if (f.rentMin !== null) p.set("rentMin", String(f.rentMin));
  if (f.rentMax !== null) p.set("rentMax", String(f.rentMax));
  if (f.saleMin !== null) p.set("saleMin", String(f.saleMin));
  if (f.saleMax !== null) p.set("saleMax", String(f.saleMax));
  if (f.furnished !== "ALL") p.set("furnished", f.furnished);
  if (f.bills !== "ALL") p.set("bills", f.bills);
  if (f.agentId) p.set("agentId", f.agentId);
  if (f.status !== "ALL") p.set("status", f.status);
  if (f.availability !== "ALL") p.set("availability", f.availability);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
  }
  return p;
}
