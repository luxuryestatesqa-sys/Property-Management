import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const listingFindFirst = vi.fn();
const orgFindUnique = vi.fn();
const userFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    listing: { findFirst: (...a: unknown[]) => listingFindFirst(...a) },
    organization: { findUnique: (...a: unknown[]) => orgFindUnique(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));

import { GET } from "./route";

const call = (id: string, qs = "") => GET(new NextRequest(`http://x/api/public/listings/${id}${qs}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  listingFindFirst.mockReset().mockResolvedValue({ id: 7, organizationId: "orgA", images: [] });
  orgFindUnique.mockReset().mockResolvedValue({ name: "A", logoUrl: null, status: "ACTIVE" });
  userFindUnique.mockReset().mockResolvedValue({ name: "Other", whatsapp: "1", status: "ACTIVE", organizationId: "orgB" });
});
afterEach(() => vi.unstubAllEnvs());

describe("public share link", () => {
  it("looks a listing up by its random token", async () => {
    await call("abc123token");
    expect(listingFindFirst.mock.calls[0][0].where).toEqual({ shareToken: "abc123token" });
  });

  it("still opens an old numeric link by default, but only for a listing that was already shared back then", async () => {
    await call("7");
    const where = listingFindFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: 7, visibility: "SHARED" });
    expect(where.createdAt.lt).toBeInstanceOf(Date); // newer listings can only be reached with their random token
    expect(where.createdAt.lt.getTime()).toBeLessThan(Date.now() + 24 * 3600_000);
  });

  it("never lets a number reach a private listing or one made after tokens", async () => {
    await call("7");
    const where = listingFindFirst.mock.calls[0][0].where;
    expect(where.visibility).toBe("SHARED");
    expect(where).not.toHaveProperty("shareToken");
  });

  it("refuses numeric links once ALLOW_NUMERIC_SHARE_LINKS=false", async () => {
    vi.stubEnv("ALLOW_NUMERIC_SHARE_LINKS", "false");
    const res = await call("7");
    expect(res.status).toBe(404);
    expect(listingFindFirst).not.toHaveBeenCalled();
  });

  it("never shows another agency's agent as the contact", async () => {
    const res = await call("tok", "?agent=someone");
    const body = await res.json();
    expect(body.agent).toBeNull();
    expect(body.listing.organizationId).toBeUndefined();
  });
});
