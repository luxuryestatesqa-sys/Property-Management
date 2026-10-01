import { describe, it, expect } from "vitest";
import { getChannelEligibility, getEligibilityForPortal } from "./eligibility";

const BASE_LISTING = {
  title: "2BR Apartment",
  description: "A lovely apartment",
  listingType: "RENT" as const,
  rentPrice: 8000,
  salePrice: null,
  area: "Lusail",
  community: "Marina District",
  buildingName: "Marina Tower 5",
  // Only relevant to getEligibilityForPortal's PROPERTY_FINDER branch, but
  // its signature requires them for every portal - see that test below.
  propertyCategory: "APARTMENT" as const,
  bathrooms: "2",
  pfLocationId: null,
};

const ONE_IMAGE = [{ id: "img1" }];

describe("getChannelEligibility", () => {
  it("is eligible when every required field is present", () => {
    const result = getChannelEligibility(BASE_LISTING, ONE_IMAGE);
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("remains eligible even if title or description is missing because of auto-fallbacks", () => {
    const result = getChannelEligibility({ ...BASE_LISTING, title: null, description: null }, ONE_IMAGE);
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("requires a rent price for a RENT listing, not a sale price", () => {
    const result = getChannelEligibility({ ...BASE_LISTING, rentPrice: null }, ONE_IMAGE);
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("Set a rent price");
  });

  it("requires a sale price for a SALE listing, not a rent price", () => {
    const result = getChannelEligibility(
      { ...BASE_LISTING, listingType: "SALE", rentPrice: null, salePrice: null },
      ONE_IMAGE
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("Set a sale price");
  });

  it("is eligible for a SALE listing once salePrice is set, even with rentPrice null", () => {
    const result = getChannelEligibility(
      { ...BASE_LISTING, listingType: "SALE", rentPrice: null, salePrice: 1500000 },
      ONE_IMAGE
    );
    expect(result.eligible).toBe(true);
  });

  it("flags zero photos", () => {
    const result = getChannelEligibility(BASE_LISTING, []);
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("Add at least one photo");
  });

  it("flags missing area/community/buildingName individually", () => {
    const result = getChannelEligibility({ ...BASE_LISTING, area: "", community: "", buildingName: "" }, ONE_IMAGE);
    expect(result.reasons).toEqual(expect.arrayContaining(["Set the area", "Set the community", "Set the building name"]));
  });

  it("accumulates missing-field reasons at once", () => {
    const result = getChannelEligibility({ ...BASE_LISTING, area: "", community: "" }, []);
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

describe("getEligibilityForPortal", () => {
  it("routes WEBSITE/QATAR_LIVING/PROPERTY_ORYX through the generic check", () => {
    for (const portal of ["WEBSITE", "QATAR_LIVING", "PROPERTY_ORYX"] as const) {
      const result = getEligibilityForPortal(portal, BASE_LISTING, ONE_IMAGE);
      expect(result.eligible).toBe(true);
    }
  });

  it("routes PROPERTY_FINDER through its own stricter check (requires pfLocationId + an account)", () => {
    const result = getEligibilityForPortal("PROPERTY_FINDER", BASE_LISTING, ONE_IMAGE, {
      portalListing: null,
      createdBy: { pfPublicProfileId: null },
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("Choose a Property Finder location");
    expect(result.reasons).toContain("Pick which Property Finder account this publishes under");
  });
});
