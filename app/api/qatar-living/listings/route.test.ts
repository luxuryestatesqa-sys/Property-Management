import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requireQatarLivingAuth = vi.fn();
vi.mock("@/lib/qatarLiving/auth", () => ({
  requireQatarLivingAuth: (...args: unknown[]) => requireQatarLivingAuth(...args),
}));

const getQatarLivingPage = vi.fn();
vi.mock("@/lib/qatarLiving/query", () => ({
  getQatarLivingPage: (...args: unknown[]) => getQatarLivingPage(...args),
}));

const { GET } = await import("./route");

function req(url: string) {
  return new NextRequest(new URL(url));
}

describe("GET /api/qatar-living/listings", () => {
  beforeEach(() => {
    requireQatarLivingAuth.mockReset();
    getQatarLivingPage.mockReset();
  });

  it("rejects an unauthenticated request before touching the database", async () => {
    const unauthorized = new Response(null, { status: 401 }) as unknown as ReturnType<typeof Response.json>;
    requireQatarLivingAuth.mockResolvedValue(unauthorized);

    const res = await GET(req("https://app.example.com/api/qatar-living/listings"));
    expect(res.status).toBe(401);
    expect(getQatarLivingPage).not.toHaveBeenCalled();
  });

  it("defaults page and page_size, and returns the envelope the spec defines", async () => {
    requireQatarLivingAuth.mockResolvedValue(null);
    getQatarLivingPage.mockResolvedValue({ listings: [{ referenceNumber: "LE-1" }], total: 1 });

    const res = await GET(req("https://app.example.com/api/qatar-living/listings"));
    const body = await res.json();

    expect(getQatarLivingPage).toHaveBeenCalledWith(1, 50, null);
    expect(body).toEqual({ page: 1, page_size: 50, total: 1, total_pages: 1, listings: [{ referenceNumber: "LE-1" }] });
  });

  it("caps page_size at 200 even if a larger value is requested", async () => {
    requireQatarLivingAuth.mockResolvedValue(null);
    getQatarLivingPage.mockResolvedValue({ listings: [], total: 0 });

    await GET(req("https://app.example.com/api/qatar-living/listings?page_size=5000"));
    expect(getQatarLivingPage).toHaveBeenCalledWith(1, 200, null);
  });

  it("parses updated_since into a Date", async () => {
    requireQatarLivingAuth.mockResolvedValue(null);
    getQatarLivingPage.mockResolvedValue({ listings: [], total: 0 });

    await GET(req("https://app.example.com/api/qatar-living/listings?updated_since=2026-01-01T00:00:00Z"));
    const calledWith = getQatarLivingPage.mock.calls[0][2] as Date;
    expect(calledWith.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("400s on an unparsable updated_since", async () => {
    requireQatarLivingAuth.mockResolvedValue(null);
    const res = await GET(req("https://app.example.com/api/qatar-living/listings?updated_since=not-a-date"));
    expect(res.status).toBe(400);
    expect(getQatarLivingPage).not.toHaveBeenCalled();
  });

  it("computes total_pages from total and page_size", async () => {
    requireQatarLivingAuth.mockResolvedValue(null);
    getQatarLivingPage.mockResolvedValue({ listings: [], total: 125 });

    const res = await GET(req("https://app.example.com/api/qatar-living/listings?page_size=50"));
    const body = await res.json();
    expect(body.total_pages).toBe(3);
  });
});
