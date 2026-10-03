import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeEqual } from "crypto";
import { FEED_SLUGS, generateFeed, type FeedFilters } from "@/lib/feeds/generateFeed";

// Permissive CORS, same rationale as the listing image route
// (app/api/listings/[id]/images/[imageId]) - the token is already the whole
// authorization, sitting in the URL's query string, so allowing any origin
// to fetch it (e.g. a browser-side script on your website) doesn't expose
// anything a same-origin-only policy would have protected.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// Public, unauthenticated (by design - a portal's crawler or your own
// website's server has no CRM session) feed, one per entry in
// lib/feeds/generateFeed's FEED_SLUGS: /feeds/pf.xml, /feeds/oryx.xml
// (portal import formats, XML) and /feeds/website.json (for your own site's
// templates, JSON) - each requiring ?agency=<id>&token=<secret> matching
// that feed's PortalCredential row. Qatar Living isn't here - see
// app/api/qatar-living/listings for its own real, paginated API. Reached
// with no proxy.ts change needed - its middleware matcher already excludes
// any path ending in .xml or .json.
export async function GET(req: NextRequest, { params }: { params: Promise<{ portal: string }> }) {
  const { portal: slug } = await params;
  const entry = FEED_SLUGS[slug];
  if (!entry) return NextResponse.json({ error: "Unknown feed" }, { status: 404, headers: CORS_HEADERS });

  const credential = await prisma.portalCredential.findUnique({ where: { portal: entry.portal } });
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const agency = req.nextUrl.searchParams.get("agency") ?? "";

  if (!credential?.feedToken || !credential.feedAgencyId || !safeEqual(token, credential.feedToken) || !safeEqual(agency, credential.feedAgencyId)) {
    return NextResponse.json({ error: "Invalid agency or token" }, { status: 401, headers: CORS_HEADERS });
  }

  const filters: FeedFilters = {};
  const typeParam = req.nextUrl.searchParams.get("type")?.toUpperCase();
  if (typeParam === "RENT" || typeParam === "SALE") filters.type = typeParam;
  const sinceParam = req.nextUrl.searchParams.get("updated_since");
  if (sinceParam) {
    const since = new Date(sinceParam);
    if (Number.isNaN(since.getTime())) {
      return NextResponse.json({ error: "updated_since must be a valid ISO-8601 timestamp" }, { status: 400, headers: CORS_HEADERS });
    }
    filters.updatedSince = since;
  }

  const result = await generateFeed(slug, filters, req.nextUrl.origin);
  if (!result) return NextResponse.json({ error: "Unknown feed" }, { status: 404, headers: CORS_HEADERS });

  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === result.etag) {
    return new NextResponse(null, { status: 304, headers: { ...CORS_HEADERS, ETag: result.etag, "Cache-Control": "public, max-age=60, s-maxage=300" } });
  }

  return new NextResponse(result.body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": entry.contentType,
      ETag: result.etag,
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    },
  });
}

// Constant-time comparison so token/agency checking doesn't leak timing
// information about how much of the secret a guess got right - same
// rationale as the Property Finder webhook's signature check
// (app/api/portals/propertyfinder/webhook).
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
