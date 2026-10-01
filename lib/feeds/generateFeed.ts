import { createHash } from "crypto";
import { Portal } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/propertyFinder/sync";
import { getChannelEligibility } from "@/lib/portals/eligibility";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_LABELS } from "@/lib/propertyCategory";
import { FeedListing, FeedResult } from "./types";
import { formatPropertyFinderFeed } from "./formatters/propertyFinder";
import { formatQatarLivingFeed } from "./formatters/qatarLiving";
import { formatPropertyOryxFeed } from "./formatters/propertyOryx";
import { formatWebsiteFeed } from "./formatters/websiteJson";

// The public feed URL slug (e.g. /feeds/pf.xml) for each portal - the one
// place mapping a URL to a Portal enum value, its formatter, and its content
// type, so adding a feed here doesn't touch the route handler itself.
export const FEED_SLUGS: Record<string, { portal: Portal; format: (listings: FeedListing[]) => string; contentType: string }> = {
  "pf.xml": { portal: "PROPERTY_FINDER", format: formatPropertyFinderFeed, contentType: "application/xml; charset=utf-8" },
  "qatarliving.xml": { portal: "QATAR_LIVING", format: formatQatarLivingFeed, contentType: "application/xml; charset=utf-8" },
  "oryx.xml": { portal: "PROPERTY_ORYX", format: formatPropertyOryxFeed, contentType: "application/xml; charset=utf-8" },
  // Your own website's feed - JSON, meant for a separate site's own
  // templates to fetch and render however they like (not a third-party
  // portal import format like the three above).
  "website.json": { portal: "WEBSITE", format: formatWebsiteFeed, contentType: "application/json; charset=utf-8" },
};

async function loadFeedListings(portal: Portal): Promise<FeedListing[]> {
  const baseUrl = getAppBaseUrl();
  const rows = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      portalListings: { some: { portal, enabled: true } },
    },
    include: {
      images: { orderBy: { sortOrder: "asc" }, select: { id: true, createdAt: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const feedListings: FeedListing[] = [];
  for (const listing of rows) {
    // Defence in depth: a listing can be edited (e.g. its last photo
    // removed) after being enabled for this channel - re-checking here means
    // it silently drops out of the feed instead of appearing there broken.
    const eligibility = getChannelEligibility(listing, listing.images);
    if (!eligibility.eligible) continue;

    const price = listing.listingType === "RENT" ? listing.rentPrice : listing.salePrice;
    if (!price) continue;

    const categoryLabel = PROPERTY_CATEGORY_LABELS[listing.propertyCategory] || listing.propertyCategory;
    const bedroomsLabel = listing.bedrooms ? BEDROOM_LABELS[listing.bedrooms] : null;
    const defaultTitle = `${bedroomsLabel ? bedroomsLabel + " " : ""}${categoryLabel} for ${listing.listingType === "RENT" ? "Rent" : "Sale"} in ${listing.buildingName ? listing.buildingName + ", " : ""}${listing.area}`;
    const defaultDescription = `Spacious ${bedroomsLabel ? bedroomsLabel.toLowerCase() + " " : ""}${categoryLabel.toLowerCase()} available for ${listing.listingType === "RENT" ? "rent" : "sale"} located in ${[listing.buildingName, listing.community, listing.area].filter(Boolean).join(", ")}. Contact Luxury Estates for details and viewings.`;

    feedListings.push({
      id: listing.id,
      reference: `LE-${listing.id}`,
      listingType: listing.listingType,
      propertyCategory: listing.propertyCategory,
      propertyCategoryLabel: categoryLabel,
      bedroomsLabel: bedroomsLabel,
      bathrooms: listing.bathrooms,
      sizeSqm: listing.sizeSqm,
      title: listing.title?.trim() || defaultTitle,
      description: listing.description?.trim() || defaultDescription,
      area: listing.area,
      community: listing.community,
      buildingName: listing.buildingName,
      price,
      priceType: listing.listingType === "RENT" ? "monthly" : "sale",
      furnished: listing.furnished,
      availabilityStatus: listing.availabilityStatus,
      // Cache-busted with each image's own createdAt (stable across repeat
      // feed fetches, unlike a request-time timestamp - a photo's id/createdAt
      // only changes when that photo is actually replaced, so this URL
      // doesn't change - and the feed's ETag doesn't either - between polls
      // that see no real change.
      images: listing.images.map((img) => `${baseUrl}/api/listings/${listing.id}/images/${img.id}.jpg?v=${img.createdAt.getTime()}`),
      updatedAt: listing.updatedAt,
    });
  }
  return feedListings;
}

function computeEtag(portal: Portal, listings: FeedListing[]): string {
  const fingerprint = listings.map((l) => `${l.id}:${l.updatedAt.getTime()}`).join(",");
  const hash = createHash("sha1").update(`${portal}|${fingerprint}`).digest("hex");
  return `"${hash}"`;
}

// Small in-process cache so back-to-back requests for an unchanged feed
// (well within a portal's own poll interval) skip rebuilding the body string -
// keyed by etag, so any real change invalidates it automatically with no
// separate cache-clearing step needed.
const bodyCache = new Map<string, string>();

export async function generateFeed(slug: string): Promise<FeedResult | null> {
  const entry = FEED_SLUGS[slug];
  if (!entry) return null;

  const listings = await loadFeedListings(entry.portal);
  const etag = computeEtag(entry.portal, listings);

  let body = bodyCache.get(etag);
  if (!body) {
    body = entry.format(listings);
    bodyCache.set(etag, body);
    // Unbounded growth isn't a real concern here (a handful of feeds, one
    // entry per distinct content state), but cap it defensively.
    if (bodyCache.size > 50) {
      const oldestKey = bodyCache.keys().next().value;
      if (oldestKey) bodyCache.delete(oldestKey);
    }
  }

  return { body, etag };
}
