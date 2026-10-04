import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { listing: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

const { FEED_SLUGS, generateFeed } = await import("./generateFeed");
const { toQatarLivingListing } = await import("@/lib/qatarLiving/listingMapper");

// Every Listing column that is private or internal. None of these names, and
// none of the values below, may appear in any feed. If a new private column is
// added to the Listing model, add it here too.
const PRIVATE_VALUES = {
  ownerName: "Sentinel Ownerson",
  ownerPhone: "+97470000001",
  ownerWhatsapp: "+97470000002",
  titleDeedNumber: "DEED-SENTINEL-77",
  privateNotes: "SENTINEL-PRIVATE-NOTE",
  titleDeedImage: "data:image/jpeg;base64,SENTINELDEED",
  authorizationFormImage: "data:image/jpeg;base64,SENTINELAUTH",
  floor: "SENTINEL-FLOOR-31",
  apartmentNumber: "SENTINEL-UNIT-3105",
  dupKey: "sentinel|dup|key",
  createdById: "sentinel-user-id-abc",
  rentalValue: 987654,
  billsStatus: "EXCLUDED",
  pfLocationId: 424242,
};

// Table of the columns that must never be requested from the database for a
// feed - the allowlist in generateFeed's FEED_LISTING_SELECT.
const PRIVATE_COLUMNS = [...Object.keys(PRIVATE_VALUES), "deactivatedAt", "createdAt", "auditLogs", "portalListings"];

const ROW = {
  id: 36,
  listingType: "RENT",
  propertyCategory: "APARTMENT",
  bedrooms: "TWO",
  bathrooms: "3",
  sizeSqm: 98,
  title: "Furnished 2BR in Lusail",
  description: "Bright apartment.\n\nTo arrange a viewing, contact Sara on +97466000000.",
  amenities: ["balcony", "shared-pool"],
  // The listing's own (older) area/community differ from the Property Finder
  // location on purpose: the feeds must show the Property Finder one.
  area: "Old Area",
  community: "Old Community",
  pfLocation: {
    id: 1197,
    name: "Al Erkyah City",
    type: "COMMUNITY",
    tree: [
      { id: 4, name: "Lusail", type: "CITY" },
      { id: 1197, name: "Al Erkyah City", type: "COMMUNITY" },
    ],
    latitude: 25.427049,
    longitude: 51.48995,
  },
  buildingName: "Marina Tower",
  rentPrice: 6500,
  salePrice: null,
  furnished: "FURNISHED",
  availabilityStatus: "AVAILABLE",
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  images: [{ id: "img1", createdAt: new Date("2026-01-01T00:00:00.000Z") }],
  createdBy: { name: "Sara", whatsapp: "+97466000000", email: "sara@example.com" },
  // A real database row would carry all of these if the query asked for them.
  ...PRIVATE_VALUES,
};

describe("feed privacy", () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([ROW]);
    process.env.APP_BASE_URL = "https://crm.example.com";
  });

  it.each(Object.keys(FEED_SLUGS))("%s never asks the database for a private column", async (slug) => {
    await generateFeed(slug, {}, "https://crm.example.com");
    const { select, include } = findMany.mock.calls[0][0];
    expect(include).toBeUndefined();
    for (const column of PRIVATE_COLUMNS) expect(select).not.toHaveProperty(column);
  });

  it.each(Object.keys(FEED_SLUGS))("%s output contains no private value or field name", async (slug) => {
    const result = await generateFeed(slug, {}, "https://crm.example.com");
    expect(result).not.toBeNull();
    const body = result!.body;
    for (const value of Object.values(PRIVATE_VALUES)) expect(body).not.toContain(String(value));
    for (const column of PRIVATE_COLUMNS) expect(body.toLowerCase()).not.toContain(column.toLowerCase());
    // Internal ids and the staff user id behind the listing.
    expect(body).not.toContain("sentinel-user-id");
  });

  it("only publishes listings that are on the market", async () => {
    await generateFeed("all.xml", {}, "https://crm.example.com");
    const { where } = findMany.mock.calls[0][0];
    expect(where.status).toBe("ACTIVE");
    expect(where.availabilityStatus).toEqual({ notIn: ["RENTED", "SOLD"] });
  });

  it("the Qatar Living mapper output contains no private value either", () => {
    const json = JSON.stringify(toQatarLivingListing(ROW as unknown as Parameters<typeof toQatarLivingListing>[0]));
    for (const value of Object.values(PRIVATE_VALUES)) expect(json).not.toContain(String(value));
    for (const column of PRIVATE_COLUMNS) expect(json.toLowerCase()).not.toContain(column.toLowerCase());
  });

  it("the master feed gives bedrooms and bathrooms as numbers, amenities as a list, and the agent contact", async () => {
    const xml = (await generateFeed("all.xml", {}, "https://crm.example.com"))!.body;
    expect(xml).toContain("<bedrooms>2</bedrooms>");
    expect(xml).toContain("<bathrooms>3</bathrooms>");
    expect(xml).toContain("<amenity>Balcony</amenity>");
    expect(xml).toContain("<email>sara@example.com</email>");
    expect(xml).not.toContain("Marina Tower"); // building stays internal in the master feed
    expect(xml).not.toMatch(/<[a-z_]+\/>/); // no empty self-closed tags
  });

  it("oryx.xml and pf.xml carry the agent block", async () => {
    for (const slug of ["oryx.xml", "pf.xml"]) {
      const xml = (await generateFeed(slug, {}, "https://crm.example.com"))!.body;
      expect(xml).toContain("<agent>");
      expect(xml).toContain("<phone>+97466000000</phone>");
    }
  });

  it("a studio is bedrooms 0, and a listing with no title falls back without naming the building", async () => {
    findMany.mockResolvedValue([{ ...ROW, bedrooms: "STUDIO", title: null, description: null, updatedAt: new Date("2026-02-02T00:00:00.000Z") }]);
    const xml = (await generateFeed("all.xml", {}, "https://crm.example.com"))!.body;
    expect(xml).toContain("<bedrooms>0</bedrooms>");
    expect(xml).not.toContain("Marina Tower");
  });

  it("every feed shows the Property Finder location with coordinates, not the listing's own area/community", async () => {
    for (const slug of ["all.xml", "oryx.xml", "pf.xml"]) {
      const xml = (await generateFeed(slug, {}, "https://crm.example.com"))!.body;
      expect(xml).toContain("<area>Lusail</area>");
      expect(xml).toContain("<community>Al Erkyah City</community>");
      expect(xml).toContain("<latitude>25.427049</latitude>");
      expect(xml).toContain("<longitude>51.48995</longitude>");
      expect(xml).not.toContain("Old Area");
      expect(xml).not.toContain("Old Community");
    }
    const json = JSON.parse((await generateFeed("website.json", {}, "https://crm.example.com"))!.body);
    expect(json.listings[0].location).toMatchObject({ area: "Lusail", community: "Al Erkyah City", latitude: 25.427049 });
  });

  it("falls back to the listing's own area/community when no Property Finder location is saved", async () => {
    findMany.mockResolvedValue([{ ...ROW, pfLocation: null, updatedAt: new Date("2026-03-03T00:00:00.000Z") }]);
    const xml = (await generateFeed("all.xml", {}, "https://crm.example.com"))!.body;
    expect(xml).toContain("<area>Old Area</area>");
    expect(xml).toContain("<community>Old Community</community>");
    expect(xml).not.toContain("<latitude>");
  });
});
