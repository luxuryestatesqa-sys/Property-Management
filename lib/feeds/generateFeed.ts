import { createHash } from "crypto";
import { Portal } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/propertyFinder/sync";
import { getChannelEligibility } from "@/lib/portals/eligibility";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_LABELS, BEDROOM_NUMBERS } from "@/lib/propertyCategory";
import { feedLocationFor } from "@/lib/propertyFinder/location";
import { AMENITY_LABELS, filterAmenitiesForCategory } from "@/lib/propertyFinder/mapping";
import { FeedListing, FeedResult } from "./types";
import { formatPropertyFinderFeed } from "./formatters/propertyFinder";
import { formatPropertyOryxFeed } from "./formatters/propertyOryx";
import { formatWebsiteFeed } from "./formatters/websiteJson";
import { formatOtherPortalsFeed } from "./formatters/otherPortals";

// The public feed URL slug (e.g. /feeds/pf.xml) for each portal - the one
// place mapping a URL to a Portal enum value, its formatter, and its content
// type, so adding a feed here doesn't touch the route handler itself.
// Qatar Living isn't here - once its real spec arrived, it got its own
// paginated, header-authenticated REST API (app/api/qatar-living/listings)
// instead of this single-file XML pull-feed pattern, which only fits
// portals that just need one importable file at a URL.
export const FEED_SLUGS: Record<string, { portal: Portal; format: (listings: FeedListing[]) => string; contentType: string }> = {
  "pf.xml": { portal: "PROPERTY_FINDER", format: formatPropertyFinderFeed, contentType: "application/xml; charset=utf-8" },
  "oryx.xml": { portal: "PROPERTY_ORYX", format: formatPropertyOryxFeed, contentType: "application/xml; charset=utf-8" },
  // Your own website's feed - JSON, meant for a separate site's own
  // templates to fetch and render however they like (not a third-party
  // portal import format like the ones above).
  "website.json": { portal: "WEBSITE", format: formatWebsiteFeed, contentType: "application/json; charset=utf-8" },
  // The one master feed for every portal other than Property Finder - only
  // listings an agent switched on "Other portals (XML)" for.
  "all.xml": { portal: "OTHER_PORTALS", format: formatOtherPortalsFeed, contentType: "application/xml; charset=utf-8" },
};

// Portals an admin can generate/regenerate a secret token for, independent
// of FEED_SLUGS - Qatar Living has a token (used as its API key, see
// lib/qatarLiving/auth.ts) but no entry in FEED_SLUGS since it's not a
// single-file pull feed.
export const TOKEN_PORTALS = new Set<Portal>(["PROPERTY_FINDER", "QATAR_LIVING", "PROPERTY_ORYX", "WEBSITE", "OTHER_PORTALS"]);

// Optional narrowing a feed URL can ask for (?type=rent|sale, ?updated_since=ISO).
export interface FeedFilters {
  type?: "RENT" | "SALE";
  updatedSince?: Date;
}

// Rented and sold listings are no longer on the market, so they never go out
// to a portal (a reserved one is still being advertised).
export const OFF_MARKET_STATUSES = ["RENTED", "SOLD"] as const;

// The exact columns a feed may read. Everything else on a Listing - owner
// name/phone, title deed, private notes, authorization form, unit/floor,
// internal ids - is never even loaded from the database here, so it can't
// end up in a feed by accident. Add a column below only if it's meant to be
// public (lib/feeds/feedPrivacy.test.ts fails if a private one appears).
export const FEED_LISTING_SELECT = {
  id: true,
  listingType: true,
  propertyCategory: true,
  bedrooms: true,
  bathrooms: true,
  sizeSqm: true,
  title: true,
  description: true,
  amenities: true,
  area: true,
  community: true,
  buildingName: true,
  pfLocation: true,
  rentPrice: true,
  salePrice: true,
  furnished: true,
  availabilityStatus: true,
  updatedAt: true,
  images: { orderBy: { sortOrder: "asc" as const }, select: { id: true, createdAt: true } },
  createdBy: { select: { name: true, whatsapp: true, email: true } },
};

async function loadFeedListings(portal: Portal, filters: FeedFilters = {}, requestOrigin?: string): Promise<FeedListing[]> {
  const baseUrl = getAppBaseUrl(requestOrigin);
  const rows = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      availabilityStatus: { notIn: [...OFF_MARKET_STATUSES] },
      portalListings: { some: { portal, enabled: true } },
      ...(filters.type ? { listingType: filters.type } : {}),
      ...(filters.updatedSince ? { updatedAt: { gte: filters.updatedSince } } : {}),
    },
    select: FEED_LISTING_SELECT,
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
    // The Property Finder location when one was chosen, else area/community.
    const location = feedLocationFor(listing);
    const purpose = listing.listingType === "RENT" ? "Rent" : "Sale";
    // Fallback copy for a listing with no title/description yet. It never
    // names the building - that stays internal - only the area and community.
    const defaultTitle = `${bedroomsLabel ? bedroomsLabel + " " : ""}${categoryLabel} for ${purpose} in ${location.area}`;
    const defaultDescription = `${bedroomsLabel ? bedroomsLabel + " " : ""}${categoryLabel} available for ${purpose.toLowerCase()} in ${[location.subcommunity, location.community, location.area].filter(Boolean).join(", ")}. Contact Luxury Estates for details and viewings.`;
    // Stored as Property Finder's enum shape: "none", "1".."20".
    const bathroomCount = listing.bathrooms === "none" ? 0 : listing.bathrooms ? parseInt(listing.bathrooms, 10) : NaN;

    feedListings.push({
      id: listing.id,
      reference: `LE-${listing.id}`,
      listingType: listing.listingType,
      propertyCategory: listing.propertyCategory,
      propertyCategoryLabel: categoryLabel,
      bedrooms: listing.bedrooms ? BEDROOM_NUMBERS[listing.bedrooms] : null,
      bathrooms: Number.isFinite(bathroomCount) ? bathroomCount : null,
      sizeSqm: listing.sizeSqm,
      title: listing.title?.trim() || defaultTitle,
      description: listing.description?.trim() || defaultDescription,
      area: location.area,
      community: location.community,
      subcommunity: location.subcommunity,
      latitude: location.latitude,
      longitude: location.longitude,
      buildingName: listing.buildingName,
      price,
      priceType: listing.listingType === "RENT" ? "monthly" : "sale",
      furnished: listing.furnished,
      availabilityStatus: listing.availabilityStatus,
      amenities: filterAmenitiesForCategory(listing.propertyCategory, listing.amenities)
        .map((a) => AMENITY_LABELS[a])
        .filter((a): a is string => Boolean(a)),
      // Cache-busted with each image's own createdAt (stable across repeat
      // feed fetches, unlike a request-time timestamp - a photo's id/createdAt
      // only changes when that photo is actually replaced, so this URL
      // doesn't change - and the feed's ETag doesn't either - between polls
      // that see no real change.
      images: listing.images.map((img) => `${baseUrl}/api/listings/${listing.id}/images/${img.id}.jpg?v=${img.createdAt.getTime()}`),
      updatedAt: listing.updatedAt,
      agentName: listing.createdBy.name,
      agentPhone: listing.createdBy.whatsapp,
      agentEmail: listing.createdBy.email,
    });
  }
  return feedListings;
}

// Bump when the shape of a feed changes without any listing changing, so
// portals polling with If-None-Match get the new format instead of a 304.
const FEED_FORMAT_VERSION = 2;

function computeEtag(portal: Portal, listings: FeedListing[]): string {
  const fingerprint = listings.map((l) => `${l.id}:${l.updatedAt.getTime()}`).join(",");
  const hash = createHash("sha1").update(`v${FEED_FORMAT_VERSION}|${portal}|${fingerprint}`).digest("hex");
  return `"${hash}"`;
}

// Small in-process cache so back-to-back requests for an unchanged feed
// (well within a portal's own poll interval) skip rebuilding the body string -
// keyed by etag, so any real change invalidates it automatically with no
// separate cache-clearing step needed.
const bodyCache = new Map<string, string>();

export async function generateFeed(slug: string, filters: FeedFilters = {}, requestOrigin?: string): Promise<FeedResult | null> {
  const entry = FEED_SLUGS[slug];
  if (!entry) return null;

  const listings = await loadFeedListings(entry.portal, filters, requestOrigin);
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
