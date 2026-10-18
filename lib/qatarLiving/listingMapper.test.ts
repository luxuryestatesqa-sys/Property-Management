import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/propertyFinder/sync", () => ({ getAppBaseUrl: () => "https://demo.example.com" }));

const { toQatarLivingListing, qatarLivingReference } = await import("./listingMapper");

const BASE_LISTING = {
  id: 8,
  listingType: "RENT" as const,
  propertyCategory: "APARTMENT" as const,
  bedrooms: "TWO" as const,
  bathrooms: "2",
  sizeSqm: 135,
  title: "Modern 2BR & Marina View",
  description: "Bright apartment with a pool view",
  amenities: ["balcony", "shared-pool", "not-a-real-amenity"],
  area: "The Pearl-Qatar",
  community: "Porto Arabia",
  buildingName: "Tower 9",
  rentPrice: 9500,
  salePrice: null,
  furnished: "FURNISHED" as const,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  images: [{ id: "img1", createdAt: new Date("2025-12-01T00:00:00.000Z") }],
  createdBy: { name: "Jane Agent", email: "jane@example.com", whatsapp: "+97455512345" },
};

describe("qatarLivingReference", () => {
  it("is stable and derived from the listing id", () => {
    expect(qatarLivingReference(8)).toBe("LE-8");
  });
});

describe("toQatarLivingListing", () => {
  it("maps the core identity, classification, and price fields", () => {
    const result = toQatarLivingListing(BASE_LISTING);
    expect(result.referenceNumber).toBe("LE-8");
    expect(result.category).toBe("Residential");
    expect(result.purpose).toBe("For Rent");
    expect(result.frequency).toBe("Monthly");
    expect(result.price).toBe(9500);
    expect(result.unitType).toBe("Apartment");
    expect(result.unitBuiltupArea).toBe(135);
    expect(result.unitMeasure).toBe("sqm");
    expect(result.bedrooms).toBe(2);
    expect(result.bathrooms).toBe(2);
    expect(result.furnishing).toBe("Furnished");
  });

  it("uses the Qatar Living title (up to 80 characters) when set, else the main title", () => {
    const long = "Spacious Furnished 2 Bedroom Apartment with Marina View in The Pearl Qatar";
    expect(long.length).toBeGreaterThan(50);
    expect(long.length).toBeLessThanOrEqual(80);
    expect(toQatarLivingListing({ ...BASE_LISTING, titleQl: long }).title).toBe(long);
    expect(toQatarLivingListing({ ...BASE_LISTING, title: "Main title", titleQl: null }).title).toBe("Main title");
  });

  it("cuts a title over 80 characters at a word instead of sending it too long", () => {
    const title = toQatarLivingListing({ ...BASE_LISTING, titleQl: "word ".repeat(30) }).title;
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith("word")).toBe(true);
  });

  it("omits frequency for a SALE listing and uses salePrice", () => {
    const result = toQatarLivingListing({ ...BASE_LISTING, listingType: "SALE", rentPrice: null, salePrice: 2500000 });
    expect(result.purpose).toBe("For Sale");
    expect(result.frequency).toBeUndefined();
    expect(result.price).toBe(2500000);
  });

  it("resolves location from the community, preferring it over the area", () => {
    const result = toQatarLivingListing(BASE_LISTING);
    expect(result.city).toBe("The Pearl");
    expect(result.area).toBe("Porto Arabia");
  });

  it("maps recognised amenities and silently drops unrecognised ones", () => {
    const result = toQatarLivingListing(BASE_LISTING);
    expect(result.facilities).toEqual(["Balcony", "Shared Pool"]);
  });

  it("builds absolute, cache-busted image URLs", () => {
    const result = toQatarLivingListing(BASE_LISTING);
    expect(result.images).toEqual([`https://demo.example.com/api/listings/8/images/img1.jpg?v=${BASE_LISTING.images[0].createdAt.getTime()}`]);
  });

  it("maps the agent from the listing's creator", () => {
    const result = toQatarLivingListing(BASE_LISTING);
    expect(result.agent).toEqual({ name: "Jane Agent", phone: "+97455512345", email: "jane@example.com" });
  });

  it("maps Studio as a string, not 0", () => {
    const result = toQatarLivingListing({ ...BASE_LISTING, bedrooms: "STUDIO" });
    expect(result.bedrooms).toBe("Studio");
  });

  it("omits bathrooms when the stored value isn't a usable number", () => {
    const result = toQatarLivingListing({ ...BASE_LISTING, bathrooms: "none" });
    expect(result.bathrooms).toBeUndefined();
  });
});

describe("maid / office layouts", () => {
  it("sends the real bedroom count and adds the maid's room as a facility", () => {
    const r = toQatarLivingListing({ ...BASE_LISTING, bedrooms: "TWO_PLUS_MAID", amenities: [] });
    expect(r.bedrooms).toBe(2);
    expect(r.facilities).toContain("Maids Room");
  });
});
