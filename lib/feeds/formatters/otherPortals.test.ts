import { describe, it, expect } from "vitest";
import { formatOtherPortalsFeed } from "./otherPortals";
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
  title: "Modern 2BR & Marina View",
  description: "Pool <great> view ]]> tricky",
  area: "Lusail",
  community: "Marina District",
  price: 9500,
  priceType: "monthly",
  buildingName: "Secret Tower 9",
  furnished: "FURNISHED",
  availabilityStatus: "AVAILABLE",
  images: ["https://demo.example.com/api/listings/8/images/a.jpg?v=1&x=2"],
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  agentName: "Ahmed Ali",
  agentPhone: "+97455555555",
};

describe("formatOtherPortalsFeed", () => {
  it("never leaks the building name", () => {
    expect(formatOtherPortalsFeed([SAMPLE])).not.toContain("Secret Tower");
  });

  it("emits reference, agent contact and escaped image URLs", () => {
    const xml = formatOtherPortalsFeed([SAMPLE]);
    expect(xml).toContain("<listings count=\"1\">");
    expect(xml).toContain("<reference>LE-8</reference>");
    expect(xml).toContain("<name>Ahmed Ali</name>");
    expect(xml).toContain("<phone>+97455555555</phone>");
    expect(xml).toContain("a.jpg?v=1&amp;x=2");
  });

  it("keeps CDATA well-formed when the text contains ]]>", () => {
    const xml = formatOtherPortalsFeed([SAMPLE]);
    expect(xml).toContain("tricky");
    expect(xml).not.toMatch(/<!\[CDATA\[[^\]]*\]\]>[^<]*tricky/);
  });

  it("renders an empty feed for no listings", () => {
    const xml = formatOtherPortalsFeed([]);
    expect(xml).toContain('<listings count="0">');
    expect(xml).not.toContain("<listing>");
  });
});
