import { reachOf, reaches } from "@/lib/scope";
import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/propertyFinder/sync";
import { FEED_LISTING_SELECT, toFeedListing } from "@/lib/feeds/generateFeed";
import { formatWebsiteFeed } from "@/lib/feeds/formatters/websiteJson";
import { formatOtherPortalsFeed } from "@/lib/feeds/formatters/otherPortals";
import { toQatarLivingListing } from "@/lib/qatarLiving/listingMapper";
import { getChannelEligibility, getQatarLivingEligibility } from "@/lib/portals/eligibility";

// What one portal will show for a listing, before it is published there: the listing as the portal
// reads it (a card), the exact data that goes out, and anything still missing. Built from the same
// code the feeds use, so the preview can't drift from what is really sent. Only the listing's owner
// or an admin may look, as for publishing itself.
export interface PortalPreview {
  portal: "WEBSITE" | "QATAR_LIVING" | "OTHER_PORTALS";
  card: {
    title: string;
    description: string;
    price: number;
    perMonth: boolean;
    location: string;
    facts: string[];
    amenities: string[];
    photos: string[];
    agent: { name: string; phone: string; email: string } | null;
  };
  payload: string;
  payloadKind: "json" | "xml";
  problems: string[];
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, scope: teamScope, error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const listingId = Number(id);
  if (!Number.isInteger(listingId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const portal = req.nextUrl.searchParams.get("portal");
  if (portal !== "WEBSITE" && portal !== "QATAR_LIVING" && portal !== "OTHER_PORTALS") {
    return NextResponse.json({ error: "Unknown portal" }, { status: 400 });
  }

  const row = await db!.listing.findUnique({ where: { id: listingId }, select: { ...FEED_LISTING_SELECT, createdById: true } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!reaches(reachOf(session!.user, "listings.editAll", teamScope), row.createdById)) {
    return NextResponse.json({ error: "You can only preview your own listings" }, { status: 403 });
  }

  let baseUrl = req.nextUrl.origin;
  try {
    baseUrl = getAppBaseUrl(req.nextUrl.origin);
  } catch {
    // keep the address this request came in on
  }
  const org = await prisma.organization.findUnique({ where: { id: orgId! }, select: { name: true } });
  const agencyName = org?.name ?? "us";

  const feed = toFeedListing(row, { baseUrl, agencyName });
  const problems = (portal === "QATAR_LIVING" ? getQatarLivingEligibility(row, row.images) : getChannelEligibility(row, row.images)).reasons;
  if (!feed) {
    return NextResponse.json({ error: row.listingType === "RENT" ? "Set a rent price to see a preview." : "Set a sale price to see a preview." }, { status: 422 });
  }

  const feedFacts = [
    feed.propertyCategoryLabel,
    feed.bedrooms === null ? null : feed.bedrooms === 0 ? "Studio" : `${feed.bedrooms} bed`,
    feed.bathrooms ? `${feed.bathrooms} bath` : null,
    feed.sizeSqm ? `${feed.sizeSqm} sqm` : null,
    feed.furnished === "FURNISHED" ? "Furnished" : "Unfurnished",
  ].filter((x): x is string => Boolean(x));
  const agent = feed.agentName ? { name: feed.agentName, phone: feed.agentPhone ?? "", email: feed.agentEmail ?? "" } : null;

  let out: PortalPreview;
  if (portal === "QATAR_LIVING") {
    // Qatar Living has its own shape and its own location list, so show what that mapper produces.
    const ql = toQatarLivingListing(row, agencyName);
    out = {
      portal,
      card: {
        title: ql.title,
        description: ql.description,
        price: ql.price,
        perMonth: ql.purpose === "For Rent",
        location: `${ql.area}, ${ql.city}`,
        facts: [ql.unitType, ql.bedrooms === undefined ? null : ql.bedrooms === 0 || ql.bedrooms === "Studio" ? "Studio" : `${ql.bedrooms} bed`, ql.bathrooms ? `${ql.bathrooms} bath` : null, `${ql.unitBuiltupArea} sqm`, ql.furnishing].filter((x): x is string => Boolean(x)),
        amenities: ql.facilities,
        photos: ql.images,
        agent: ql.agent,
      },
      payload: JSON.stringify(ql, null, 2),
      payloadKind: "json",
      problems,
    };
  } else {
    const location = [feed.subcommunity, feed.community, feed.area].filter(Boolean).join(", ");
    const card = { title: feed.title, description: feed.description, price: feed.price, perMonth: feed.priceType === "monthly", location, facts: feedFacts, amenities: feed.amenities, photos: feed.images, agent };
    out =
      portal === "WEBSITE"
        ? { portal, card, payload: JSON.stringify(JSON.parse(formatWebsiteFeed([feed])).listings[0], null, 2), payloadKind: "json", problems }
        : { portal, card, payload: formatOtherPortalsFeed([feed]), payloadKind: "xml", problems };
  }
  return NextResponse.json(out);
}
