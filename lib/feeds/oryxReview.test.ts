import { describe, it, expect } from "vitest";
import { FeedListing } from "./types";
import { reviewOryx, ListingState } from "./oryxReview";

const OK: ListingState = { visibility: "SHARED", status: "ACTIVE", availabilityStatus: "AVAILABLE", photosTotal: 5 };
const GOOD: FeedListing = {
  id: 7,
  reference: "LE-7",
  listingType: "RENT",
  propertyCategory: "APARTMENT",
  propertyCategoryLabel: "Apartment",
  bedrooms: 2,
  bathrooms: 2,
  sizeSqm: 110,
  title: "Furnished 2BR with marina view",
  description: "A bright, furnished two bedroom apartment on a high floor with a marina view, close to the metro, schools and shops.",
  area: "Doha",
  community: "The Pearl",
  subcommunity: "Porto Arabia",
  latitude: 25.37,
  longitude: 51.55,
  buildingName: "Marina Tower",
  price: 7500,
  priceType: "monthly",
  furnished: "FURNISHED",
  availabilityStatus: "AVAILABLE",
  amenities: [],
  amenityKeys: ["balcony", "shared-pool"],
  images: ["https://x/1.jpg"],
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  agentName: "Sara",
  agentPhone: "+97455500001",
  agentEmail: "sara@x.test",
};
const levels = (r: ReturnType<typeof reviewOryx>, level: string) => r.problems.filter((p) => p.level === level).map((p) => p.field);

describe("Property Oryx review", () => {
  it("a complete listing has no errors or warnings (only notes)", () => {
    const r = reviewOryx(GOOD, OK);
    expect(levels(r, "error")).toEqual([]);
    expect(levels(r, "warning")).toEqual([]);
    expect(r.problems.every((p) => p.level === "info")).toBe(true);
  });

  it("blocks a private, deactivated, rented or photo-less listing, and a missing location", () => {
    expect(levels(reviewOryx(GOOD, { ...OK, visibility: "PRIVATE" }), "error")).toContain("listing");
    expect(levels(reviewOryx(GOOD, { ...OK, status: "INACTIVE" }), "error")).toContain("listing");
    expect(reviewOryx(GOOD, { ...OK, availabilityStatus: "RENTED" }).problems[0].message).toContain("rented");
    expect(levels(reviewOryx(GOOD, { ...OK, photosTotal: 0 }), "error")).toContain("photos");
    expect(levels(reviewOryx({ ...GOOD, area: "", community: "", buildingName: "" }, OK), "error")).toEqual(["location", "location", "location"]);
  });

  it("warns about things that make a weak listing, and says which part of the form to look at", () => {
    const r = reviewOryx({ ...GOOD, title: "LUXURY APARTMENT IN LUSAIL", description: "Nice flat.", sizeSqm: null, bedrooms: null, bathrooms: 0, latitude: null, agentPhone: "5550001", agentEmail: undefined }, OK);
    const fields = levels(r, "warning");
    expect(fields).toEqual(expect.arrayContaining(["title", "description", "size", "bedrooms", "bathrooms", "location", "agent"]));
    expect(r.problems.filter((p) => p.field === "agent")).toHaveLength(2); // phone and email
  });

  it("commercial listings aren't asked for bedrooms or bathrooms", () => {
    const r = reviewOryx({ ...GOOD, propertyCategory: "OFFICE", bedrooms: null, bathrooms: null }, OK);
    expect(levels(r, "warning")).toEqual([]);
    expect(r.fields.map((f) => f.label)).not.toContain("Bedrooms");
  });

  it("explains photo limits, rounded sizes and amenities without a code", () => {
    const r = reviewOryx({ ...GOOD, sizeSqm: 82.5, amenityKeys: ["childrens-play-area", "balcony"] }, { ...OK, photosTotal: 14 });
    expect(r.problems.find((p) => p.field === "photos")?.message).toContain("first 10");
    expect(r.problems.find((p) => p.field === "size")?.message).toContain("83");
    expect(r.problems.find((p) => p.field === "amenities")?.message).toContain("Children");
    expect(r.fields.find((f) => f.label === "Photos")?.value).toBe("10 of 14 sent");
  });

  it("lists exactly what is sent: codes, rounded numbers and the map pin (longitude first)", () => {
    const r = reviewOryx(GOOD, OK);
    const get = (l: string) => r.fields.find((f) => f.label === l);
    expect(get("Offering")).toMatchObject({ value: "Residential for rent", sent: "RR" });
    expect(get("Property type")).toMatchObject({ value: "Apartment", sent: "AP" });
    expect(get("Price")?.sent).toBe("7500");
    expect(get("Amenities")?.sent).toBe("BA,SP");
    expect(get("Map pin")?.sent).toBe("51.55,25.37");
    expect(get("Bedrooms")?.sent).toBe("2");
  });

  it("puts errors first, then warnings, then notes", () => {
    const r = reviewOryx({ ...GOOD, sizeSqm: null }, { ...OK, photosTotal: 0 });
    expect(r.problems.map((p) => p.level)).toEqual([...r.problems.map((p) => p.level)].sort((a, b) => ["error", "warning", "info"].indexOf(a) - ["error", "warning", "info"].indexOf(b)));
    expect(r.problems[0].level).toBe("error");
  });
});
