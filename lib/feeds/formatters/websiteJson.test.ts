import { describe, it, expect } from "vitest";
import { formatWebsiteFeed } from "./websiteJson";
import { FeedListing } from "../types";

const SAMPLE: FeedListing = {
  id: 8,
  reference: "LE-8",
  listingType: "RENT",
  propertyCategory: "APARTMENT",
  propertyCategoryLabel: "Apartment",
  bedroomsLabel: "2 Bedroom",
  bathrooms: "2",
  sizeSqm: 135,
  title: "Modern 2BR Apartment",
  description: "Bright apartment with a pool view",
  area: "Lusail",
  community: "Marina District",
  price: 9500,
  priceType: "monthly",
  buildingName: "Marina Tower 9",
  furnished: "FURNISHED",
  availabilityStatus: "AVAILABLE",
  images: ["https://demo.example.com/api/listings/8/images/img1.jpg?v=1"],
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("formatWebsiteFeed", () => {
  it("produces valid JSON with a count and a listings array", () => {
    const parsed = JSON.parse(formatWebsiteFeed([SAMPLE, SAMPLE]));
    expect(parsed.count).toBe(2);
    expect(parsed.listings).toHaveLength(2);
  });

  it("maps every field to a plain JSON-friendly shape", () => {
    const parsed = JSON.parse(formatWebsiteFeed([SAMPLE]));
    const item = parsed.listings[0];
    expect(item).toMatchObject({
      id: 8,
      reference: "LE-8",
      listingType: "RENT",
      propertyType: "Apartment",
      bedrooms: "2 Bedroom",
      price: 9500,
      priceType: "monthly",
      furnished: true,
      availability: "available",
      location: { area: "Lusail", community: "Marina District", building: "Marina Tower 9", country: "Qatar" },
      images: ["https://demo.example.com/api/listings/8/images/img1.jpg?v=1"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("returns an empty array for no listings", () => {
    const parsed = JSON.parse(formatWebsiteFeed([]));
    expect(parsed).toEqual({ count: 0, listings: [] });
  });
});
