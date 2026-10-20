import { reachOf, reaches } from "@/lib/scope";
import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/propertyFinder/sync";
import { FEED_LISTING_SELECT, toFeedListing } from "@/lib/feeds/generateFeed";
import { oryxPropertyXml } from "@/lib/feeds/formatters/propertyOryx";
import { reviewOryx } from "@/lib/feeds/oryxReview";

// Everything the Property Oryx review page shows for one listing: the exact XML Oryx would receive,
// a plain list of the values, and what is missing or worth checking. Only the listing's owner or an
// admin may look, as for publishing itself.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, scope: teamScope, error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const listingId = Number(id);
  if (!Number.isInteger(listingId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const head = await db!.listing.findUnique({ where: { id: listingId }, select: { createdById: true, visibility: true, status: true, availabilityStatus: true } });
  if (!head) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!reaches(reachOf(session!.user, "listings.editAll", teamScope), head.createdById)) {
    return NextResponse.json({ error: "You can only review your own listings" }, { status: 403 });
  }

  const [row, channel, org] = await Promise.all([
    db!.listing.findUnique({ where: { id: listingId }, select: FEED_LISTING_SELECT }),
    db!.portalListing.findFirst({ where: { listingId, portal: "PROPERTY_ORYX" }, select: { enabled: true } }),
    prisma.organization.findUnique({ where: { id: orgId! }, select: { name: true } }),
  ]);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let baseUrl = req.nextUrl.origin;
  try {
    baseUrl = getAppBaseUrl(req.nextUrl.origin);
  } catch {
    // keep the address this request came in on
  }
  const enabled = channel?.enabled ?? false;
  const feed = toFeedListing(row, { baseUrl, agencyName: org?.name ?? "us" });
  if (!feed) {
    const rent = row.listingType === "RENT";
    return NextResponse.json({ enabled, xml: null, fields: [], problems: [{ level: "error", field: "price", message: rent ? "Set a rent price." : "Set a sale price." }] });
  }

  const { problems, fields } = reviewOryx(feed, { visibility: head.visibility, status: head.status, availabilityStatus: head.availabilityStatus, photosTotal: row.images.length });
  return NextResponse.json({ enabled, xml: oryxPropertyXml(feed), fields, problems, ready: !problems.some((p) => p.level === "error") });
}
