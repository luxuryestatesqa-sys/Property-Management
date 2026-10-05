import { describe, it, expect } from "vitest";
import { canViewListing, visibleListingsWhere, canViewPrivateDetails, redactPrivateFields, redactPrivateFieldsList, PRIVATE_LISTING_FIELDS } from "./listingPrivacy";

const OWNER_ID = "agent-1";
const OTHER_AGENT_ID = "agent-2";

function makeListing(overrides: Partial<Record<(typeof PRIVATE_LISTING_FIELDS)[number] | "createdById", string>> = {}) {
  return {
    id: 42,
    createdById: OWNER_ID,
    title: "2BR Apartment",
    ownerName: "Real Owner",
    ownerPhone: "+97455500000",
    ownerWhatsapp: "+97455500001",
    titleDeedNumber: "TD-12345",
    privateNotes: "Owner wants cash only",
    titleDeedImage: "data:image/jpeg;base64,abc",
    authorizationFormImage: "data:image/jpeg;base64,def",
    ...overrides,
  };
}

describe("canViewPrivateDetails", () => {
  it("lets the listing's own creator view it", () => {
    expect(canViewPrivateDetails(OWNER_ID, OWNER_ID, false)).toBe(true);
  });

  it("lets an admin view any listing's private details", () => {
    expect(canViewPrivateDetails(OWNER_ID, OTHER_AGENT_ID, true)).toBe(true);
  });

  it("blocks a different, non-admin agent", () => {
    expect(canViewPrivateDetails(OWNER_ID, OTHER_AGENT_ID, false)).toBe(false);
  });
});

describe("redactPrivateFields", () => {
  it("leaves every field intact for the listing's own creator", () => {
    const listing = makeListing();
    const result = redactPrivateFields(listing, OWNER_ID, false);
    expect(result).toEqual(listing);
  });

  it("leaves every field intact for an admin viewer", () => {
    const listing = makeListing();
    const result = redactPrivateFields(listing, OTHER_AGENT_ID, true);
    expect(result).toEqual(listing);
  });

  it("nulls out every private field for a different agent - this is the core 'protect which agent has this listing' guarantee", () => {
    const listing = makeListing();
    const result = redactPrivateFields(listing, OTHER_AGENT_ID, false);
    for (const field of PRIVATE_LISTING_FIELDS) {
      expect(result[field]).toBeNull();
    }
  });

  it("never touches non-private fields", () => {
    const listing = makeListing();
    const result = redactPrivateFields(listing, OTHER_AGENT_ID, false);
    expect(result.id).toBe(42);
    expect(result.title).toBe("2BR Apartment");
    expect(result.createdById).toBe(OWNER_ID);
  });

  it("redacts a field that was already null the same as any other value (no 'empty vs hidden' leak)", () => {
    const listing = makeListing({ privateNotes: undefined as unknown as string });
    const result = redactPrivateFields(listing, OTHER_AGENT_ID, false);
    expect(result.privateNotes).toBeNull();
  });
});

describe("redactPrivateFieldsList", () => {
  it("applies per-listing redaction based on each listing's own creator, not a single global check", () => {
    const own = makeListing({ ownerName: "Mine" });
    const others = makeListing({ ownerName: "Someone else's", createdById: OTHER_AGENT_ID });
    const [a, b] = redactPrivateFieldsList([own, others], OWNER_ID, false);
    expect(a.ownerName).toBe("Mine");
    expect(b.ownerName).toBeNull();
  });
});

describe("listing visibility", () => {
  const priv = { createdById: "a", visibility: "PRIVATE" as const };
  const shared = { createdById: "a", visibility: "SHARED" as const };

  it("lets only the creator and admins see a private listing", () => {
    expect(canViewListing(priv, "a", false)).toBe(true);
    expect(canViewListing(priv, "b", false)).toBe(false);
    expect(canViewListing(priv, "b", true)).toBe(true);
  });

  it("lets everyone see a shared listing", () => {
    expect(canViewListing(shared, "b", false)).toBe(true);
  });

  it("builds a where clause that hides other agents' private listings", () => {
    expect(visibleListingsWhere("b", false)).toEqual({ OR: [{ visibility: "SHARED" }, { createdById: "b" }] });
    expect(visibleListingsWhere("b", true)).toEqual({});
  });
});
