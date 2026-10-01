import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { portalCredential: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

const generateFeed = vi.fn();
vi.mock("@/lib/feeds/generateFeed", () => ({
  FEED_SLUGS: { "qatarliving.xml": { portal: "QATAR_LIVING", format: () => "", contentType: "application/xml; charset=utf-8" } },
  generateFeed: (...args: unknown[]) => generateFeed(...args),
}));

// Imported after the mocks above so the route picks them up.
const { GET } = await import("./route");

function req(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(url), { headers });
}

describe("GET /feeds/[portal]", () => {
  beforeEach(() => {
    findUnique.mockReset();
    generateFeed.mockReset();
  });

  it("404s for a portal slug with no feed", async () => {
    const res = await GET(req("https://app.example.com/feeds/unknown.xml"), { params: Promise.resolve({ portal: "unknown.xml" }) });
    expect(res.status).toBe(404);
  });

  it("401s when no credential row exists for the portal yet", async () => {
    findUnique.mockResolvedValue(null);
    const res = await GET(req("https://app.example.com/feeds/qatarliving.xml?agency=A&token=T"), {
      params: Promise.resolve({ portal: "qatarliving.xml" }),
    });
    expect(res.status).toBe(401);
  });

  it("401s on a wrong token, even with the right agency id", async () => {
    findUnique.mockResolvedValue({ feedAgencyId: "AGENCY1", feedToken: "correct-token" });
    const res = await GET(req("https://app.example.com/feeds/qatarliving.xml?agency=AGENCY1&token=wrong-token"), {
      params: Promise.resolve({ portal: "qatarliving.xml" }),
    });
    expect(res.status).toBe(401);
    expect(generateFeed).not.toHaveBeenCalled();
  });

  it("401s on a wrong agency id, even with the right token", async () => {
    findUnique.mockResolvedValue({ feedAgencyId: "AGENCY1", feedToken: "correct-token" });
    const res = await GET(req("https://app.example.com/feeds/qatarliving.xml?agency=WRONG&token=correct-token"), {
      params: Promise.resolve({ portal: "qatarliving.xml" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns the feed body with matching agency+token, content type from the slug's entry", async () => {
    findUnique.mockResolvedValue({ feedAgencyId: "AGENCY1", feedToken: "correct-token" });
    generateFeed.mockResolvedValue({ body: "<listings/>", etag: '"abc123"' });
    const res = await GET(req("https://app.example.com/feeds/qatarliving.xml?agency=AGENCY1&token=correct-token"), {
      params: Promise.resolve({ portal: "qatarliving.xml" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    expect(res.headers.get("ETag")).toBe('"abc123"');
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.text()).toBe("<listings/>");
  });

  it("returns 304 with no body when If-None-Match matches the current ETag", async () => {
    findUnique.mockResolvedValue({ feedAgencyId: "AGENCY1", feedToken: "correct-token" });
    generateFeed.mockResolvedValue({ body: "<listings/>", etag: '"abc123"' });
    const res = await GET(
      req("https://app.example.com/feeds/qatarliving.xml?agency=AGENCY1&token=correct-token", { "if-none-match": '"abc123"' }),
      { params: Promise.resolve({ portal: "qatarliving.xml" }) }
    );
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
  });
});
