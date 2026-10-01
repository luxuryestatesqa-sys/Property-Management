import { describe, it, expect } from "vitest";
import { buildGenericListingsXml } from "./genericFormat";
import { formatQatarLivingFeed } from "./qatarLiving";
import { formatPropertyOryxFeed } from "./propertyOryx";
import { formatPropertyFinderFeed } from "./propertyFinder";
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
  description: "Bright apartment with a pool <great> view",
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

describe("buildGenericListingsXml", () => {
  it("produces a well-formed root element with the correct count", () => {
    const xml = buildGenericListingsXml("test_listings", [SAMPLE, SAMPLE]);
    expect(xml).toContain('<test_listings count="2">');
    expect(xml).toContain("</test_listings>");
    expect(xml.match(/<listing>/g)).toHaveLength(2);
  });

  it("escapes reserved characters in plain tags but CDATA-wraps title/description", () => {
    const xml = buildGenericListingsXml("test_listings", [SAMPLE]);
    expect(xml).toContain("<title><![CDATA[Modern 2BR & Marina View]]></title>");
    expect(xml).toContain("<description><![CDATA[Bright apartment with a pool <great> view]]></description>");
  });

  it("maps listing type, price, and location fields correctly", () => {
    const xml = buildGenericListingsXml("test_listings", [SAMPLE]);
    expect(xml).toContain("<listing_type>rent</listing_type>");
    expect(xml).toContain("<price>9500</price>");
    expect(xml).toContain("<price_type>monthly</price_type>");
    expect(xml).toContain("<area>Lusail</area>");
    expect(xml).toContain("<community>Marina District</community>");
    expect(xml).toContain("<building>Marina Tower 9</building>");
  });

  it("includes every image URL", () => {
    const xml = buildGenericListingsXml("test_listings", [SAMPLE]);
    expect(xml).toContain("<image>https://demo.example.com/api/listings/8/images/img1.jpg?v=1</image>");
  });

  it("renders an empty root element for an empty listing set", () => {
    const xml = buildGenericListingsXml("test_listings", []);
    expect(xml).toContain('<test_listings count="0">');
    expect(xml).not.toContain("<listing>");
  });
});

describe("per-portal formatters", () => {
  it("each uses its own root tag but the same generic listing shape", () => {
    expect(formatQatarLivingFeed([SAMPLE])).toContain("<qatarliving_listings");
    expect(formatPropertyOryxFeed([SAMPLE])).toContain("<propertyoryx_listings");
    expect(formatPropertyFinderFeed([SAMPLE])).toContain("<propertyfinder_listings");
  });
});
