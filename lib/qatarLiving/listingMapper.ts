import { Listing, PropertyCategory, BedroomCount, Furnished } from "@prisma/client";
import { getAppBaseUrl } from "@/lib/propertyFinder/sync";
import { isResidentialCategory } from "@/lib/propertyCategory";
import { resolveQatarLivingLocation } from "./locations";

// Qatar Living's `type` enum (their feed API spec, Appendix A) has no exact
// match for every category we track - these are the closest reasonable
// equivalent, not a 1:1 mapping.
const UNIT_TYPE: Record<PropertyCategory, string> = {
  APARTMENT: "Apartment",
  VILLA: "Villa",
  TOWNHOUSE: "House",
  PENTHOUSE: "Apartment",
  DUPLEX: "Apartment",
  COMPOUND_VILLA: "Building / Compound",
  WHOLE_BUILDING: "Full Building",
  OFFICE: "Office",
  RETAIL: "Retail",
  LAND: "Land",
};

const BEDROOM_COUNT: Record<BedroomCount, string | number> = {
  STUDIO: "Studio",
  ONE: 1,
  ONE_PLUS_OFFICE: 1,
  TWO: 2,
  TWO_PLUS_MAID: 2,
  THREE: 3,
  THREE_PLUS_MAID: 3,
  FOUR: 4,
  FOUR_PLUS_MAID: 4,
  FIVE: 5,
  FIVE_PLUS_MAID: 5,
  SIX_PLUS: 6,
};

// Our Furnished enum only distinguishes furnished/unfurnished (no "Semi
// Furnished") - matches section 5.2's `furnishing` enum values exactly
// (Furnished / Semi Furnished / Unfurnished), not Appendix A's differently
// named/cased `furnishingType` field, which belongs to a different endpoint.
const FURNISHING: Record<Furnished, string> = {
  FURNISHED: "Furnished",
  UNFURNISHED: "Unfurnished",
};

// Best-effort text match from our Property Finder amenity enum (the only
// amenity vocabulary this app stores) to Qatar Living's own amenity names
// (Appendix A). Only amenities with a confident equivalent are included;
// anything else is silently dropped rather than guessed - QL ignores
// unrecognized values anyway, so a dropped amenity is no worse than one
// sent wrong.
const AMENITY: Record<string, string> = {
  "built-in-wardrobes": "Built in wardrobes",
  "kitchen-appliances": "Kitchen Appliances",
  security: "Security",
  concierge: "Concierge",
  "maid-service": "Maid Service",
  balcony: "Balcony",
  "private-gym": "Private Gym",
  "shared-gym": "Shared gym",
  "private-jacuzzi": "Private Jacuzzi",
  "shared-spa": "Health Spa",
  "covered-parking": "Car Park",
  "maids-room": "Maids Room",
  study: "Study room",
  "childrens-play-area": "Kids Play Area",
  "pets-allowed": "Pet-Friendly",
  "barbecue-area": "Bbq Area",
  "shared-pool": "Shared Pool",
  "childrens-pool": "Kids pool",
  "private-garden": "Private Garden",
  "private-pool": "Private Pool",
  "view-of-water": "Water view",
  "view-of-landmark": "Landmark view",
  "walk-in-closet": "Walk-In Closet",
  networked: "Networked",
  "dining-in-building": "Dining in building",
  "conference-room": "Conference Room",
};

type MapperListing = Pick<
  Listing,
  | "id"
  | "listingType"
  | "propertyCategory"
  | "bedrooms"
  | "bathrooms"
  | "sizeSqm"
  | "title"
  | "description"
  | "amenities"
  | "area"
  | "community"
  | "buildingName"
  | "rentPrice"
  | "salePrice"
  | "furnished"
  | "updatedAt"
> & {
  images: { id: string; createdAt: Date }[];
  createdBy: { name: string; email: string; whatsapp: string };
};

// The exact JSON shape Qatar Living's feed API spec (v1.0, §5) defines for
// one listing object. Field names and casing match the spec precisely -
// this is their contract, not ours, so it isn't reshaped to match this
// app's own naming conventions elsewhere.
export interface QatarLivingListing {
  referenceNumber: string;
  lastUpdated: string;
  category: "Residential" | "Commercial";
  purpose: "For Sale" | "For Rent";
  frequency?: "Yearly" | "Monthly" | "Weekly" | "Daily";
  unitType: string;
  title: string;
  description: string;
  unitBuiltupArea: number;
  unitMeasure: "sqm";
  bedrooms?: string | number;
  bathrooms?: number;
  furnishing: string;
  facilities: string[];
  price: number;
  city: string;
  area: string;
  latitude: number;
  longitude: number;
  images: string[];
  agent: { name: string; phone: string; email: string };
}

// Builds a reference number stable across edits - must "never change or be
// reused" per the spec, so it's derived from the listing's own immutable id
// rather than anything editable. Matches the `reference` already used
// elsewhere (lib/feeds/generateFeed.ts) for the same listing.
export function qatarLivingReference(listingId: number): string {
  return `LE-${listingId}`;
}

export function toQatarLivingListing(listing: MapperListing): QatarLivingListing {
  const baseUrl = getAppBaseUrl();
  const location = resolveQatarLivingLocation(listing.area, listing.community);
  const price = listing.listingType === "RENT" ? listing.rentPrice : listing.salePrice;
  const bathrooms = listing.bathrooms ? parseInt(listing.bathrooms, 10) : NaN;

  return {
    referenceNumber: qatarLivingReference(listing.id),
    lastUpdated: listing.updatedAt.toISOString(),
    category: isResidentialCategory(listing.propertyCategory) ? "Residential" : "Commercial",
    purpose: listing.listingType === "RENT" ? "For Rent" : "For Sale",
    // This app always treats rentPrice as a monthly figure (see
    // lib/feeds/generateFeed.ts's priceType), so rentals are always "Monthly".
    ...(listing.listingType === "RENT" ? { frequency: "Monthly" as const } : {}),
    unitType: UNIT_TYPE[listing.propertyCategory],
    title: listing.title?.trim() || `${listing.propertyCategory} for ${listing.listingType === "RENT" ? "Rent" : "Sale"} in ${listing.area}`,
    description: listing.description?.trim() || "Contact Luxury Estates for details and viewings.",
    unitBuiltupArea: listing.sizeSqm!,
    unitMeasure: "sqm",
    ...(listing.bedrooms ? { bedrooms: BEDROOM_COUNT[listing.bedrooms] } : {}),
    ...(Number.isFinite(bathrooms) && bathrooms > 0 ? { bathrooms } : {}),
    furnishing: FURNISHING[listing.furnished],
    facilities: listing.amenities.map((a) => AMENITY[a]).filter((a): a is string => Boolean(a)),
    price: price!,
    city: location.city,
    area: location.area,
    latitude: location.latitude,
    longitude: location.longitude,
    images: listing.images.map((img) => `${baseUrl}/api/listings/${listing.id}/images/${img.id}.jpg?v=${img.createdAt.getTime()}`),
    agent: { name: listing.createdBy.name, phone: listing.createdBy.whatsapp, email: listing.createdBy.email },
  };
}
