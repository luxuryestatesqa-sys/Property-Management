import { describe, it, expect } from "vitest";
import { getPfStatus } from "./status";

const s = (state: string | null, enabled = false, remoteListingId: string | null = "abc") => getPfStatus({ state, enabled, remoteListingId });

describe("getPfStatus", () => {
  it("is not published when nothing was ever sent to Property Finder", () => {
    expect(getPfStatus(null).kind).toBe("not_published");
    expect(s("live", true, null).kind).toBe("not_published");
  });

  it("treats live as published even if this app's own flag is false", () => {
    const v = s("live", false);
    expect(v.kind).toBe("live");
    expect(v.active).toBe(true);
  });

  it("treats pending_publishing as publishing (active)", () => {
    expect(s("pending_publishing", true)).toMatchObject({ kind: "publishing", active: true });
  });

  it("never reports failed / taken-down listings as published, even if the flag is true", () => {
    expect(s("publishing_failed", true)).toMatchObject({ kind: "failed", active: false });
    expect(s("takendown", true)).toMatchObject({ kind: "failed", active: false });
  });

  it("reports draft / unpublished / archived as not live", () => {
    for (const st of ["draft", "unpublished", "archived"]) {
      expect(s(st, true)).toMatchObject({ kind: "not_live", active: false });
    }
  });

  it("falls back to the agent's intent for an unknown stage", () => {
    expect(s(null, true)).toMatchObject({ kind: "publishing", active: true });
    expect(s("something_new", false)).toMatchObject({ kind: "not_live", active: false });
  });
});

import { getPropertyFinderEligibility, describePropertyFinderRejection } from "./sync";
import { PropertyFinderApiError } from "./client";

const READY = {
  title: "t",
  description: "d",
  bathrooms: "2",
  propertyCategory: "APARTMENT" as const,
  pfLocationId: 1,
  listingType: "RENT" as const,
  rentPrice: 5000,
  salePrice: null,
};

describe("getPropertyFinderEligibility price check", () => {
  it("passes with a rent price on a rent listing", () => {
    expect(getPropertyFinderEligibility(READY, [{ id: "a" }], 7).eligible).toBe(true);
  });

  it("blocks a rent listing with no rent price (even if it has a sale price)", () => {
    const r = getPropertyFinderEligibility({ ...READY, rentPrice: null, salePrice: 900000 }, [{ id: "a" }], 7);
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain("Set a monthly rent price");
  });

  it("blocks a sale listing with no sale price", () => {
    const r = getPropertyFinderEligibility({ ...READY, listingType: "SALE", rentPrice: 5000, salePrice: null }, [{ id: "a" }], 7);
    expect(r.reasons).toContain("Set a sale price");
  });
});

describe("describePropertyFinderRejection", () => {
  it("turns PF field pointers into labelled plain lines", () => {
    const err = new PropertyFinderApiError(400, "One or more fields failed validation.", undefined, [
      { pointer: "/price/paymentMethods", title: "Invalid Price", detail: "The price details are invalid or incomplete for this listing type." },
    ]);
    expect(describePropertyFinderRejection(err)).toBe("Price: The price details are invalid or incomplete for this listing type.");
  });

  it("falls back to the message when there are no field errors", () => {
    expect(describePropertyFinderRejection(new PropertyFinderApiError(500, "Boom"))).toBe("Boom");
  });
});
