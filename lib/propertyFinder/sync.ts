import { prisma } from "@/lib/prisma";
import type { Listing } from "@prisma/client";
import { pfCategoryAndType, PF_BEDROOMS, PF_FURNISHING_TYPE, filterAmenitiesForCategory } from "./mapping";
import { createListing, updateListing, publishListing, unpublishListing, listUsers, getPublishPrice, PFListingPayload, PropertyFinderApiError } from "./client";

// This portal's identity in the generic PortalListing/PortalCredential
// tables (see prisma/schema.prisma's Portal enum) - the one constant that
// would need a sibling when a second portal is added.
const PORTAL = "PROPERTY_FINDER" as const;

function portalKey(listingId: number) {
  return { listingId_portal: { listingId, portal: PORTAL } };
}

// The Property Finder account a listing actually publishes under: an explicit
// per-listing override (set from the publish page) takes precedence over the
// listing's own agent's linked account, so a listing can be reassigned to a
// different agent's PF account without changing who owns it in this app.
export function effectiveAssignedProfileId(
  portalListing: { assignedProfileId: number | null } | null | undefined,
  createdBy: { pfPublicProfileId: number | null }
): number | null {
  return portalListing?.assignedProfileId ?? createdBy.pfPublicProfileId;
}

// Property Finder needs a real, absolute, publicly-fetchable URL for each
// image - there's no existing app-base-url convention in this codebase
// (buildListingShareUrl derives it from window.location, client-side only),
// so this is new: set APP_BASE_URL explicitly (recommended - stable across
// deploys), or it falls back to Vercel's own VERCEL_URL at runtime.
export function getAppBaseUrl(): string {
  const raw = process.env.APP_BASE_URL ? process.env.APP_BASE_URL.replace(/\/$/, "") : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  if (!raw) {
    throw new Error("APP_BASE_URL (or VERCEL_URL) is not set - required to build publicly-fetchable image URLs for Property Finder");
  }

  // A loopback/private hostname here (e.g. APP_BASE_URL left at its local-dev
  // default of http://localhost:3000) builds image/webhook URLs Property
  // Finder's servers can never reach - their edge rejects the request outright
  // (a generic HTML block page, not their normal JSON error), which otherwise
  // shows up as an unexplained 403 on publish with no clue why.
  const hostname = new URL(raw).hostname;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname);
  if (isLocal) {
    throw new Error(
      `APP_BASE_URL is set to ${raw}, which Property Finder can't reach over the public internet - publishing and webhooks will fail. Set it to your deployed site's public URL, or use a public tunnel (e.g. ngrok) while testing from local dev.`
    );
  }
  return raw;
}

export interface PropertyFinderEligibility {
  eligible: boolean;
  reasons: string[];
}

// Shared by the toggle API route and the publish UI, so both enforce
// (and explain) exactly the same rules.
export function getPropertyFinderEligibility(
  listing: Pick<Listing, "title" | "description" | "bathrooms" | "propertyCategory" | "pfLocationId">,
  images: { id: string }[],
  assignedProfileId: number | null
): PropertyFinderEligibility {
  const reasons: string[] = [];
  if (!listing.title) reasons.push("Add a title");
  if (!listing.description) reasons.push("Add a description");
  if (listing.propertyCategory !== "LAND" && !listing.bathrooms) reasons.push("Set the number of bathrooms");
  if (images.length === 0) reasons.push("Add at least one photo");
  if (!listing.pfLocationId) reasons.push("Choose a Property Finder location");
  if (!assignedProfileId) reasons.push("Pick which Property Finder account this publishes under");
  return { eligible: reasons.length === 0, reasons };
}

function buildListingPayload(
  listing: Listing & { images: { id: string }[] },
  assignedProfileId: number,
  pfUserId: number,
  reference: string
): PFListingPayload {
  const { category, type } = pfCategoryAndType(listing.propertyCategory);
  const baseUrl = getAppBaseUrl();

  // listing.rentPrice is stored (and shown everywhere else in this app) as a
  // monthly figure, not annual - "monthly" is one of PF's own price.type
  // options, so this sends it as-is rather than mislabeling it "yearly"
  // (which would have published every rental at 1/12th its real price).
  const priceType = listing.listingType === "RENT" ? "monthly" : "sale";
  const priceAmount = listing.listingType === "RENT" ? listing.rentPrice : listing.salePrice;

  return {
    reference,
    category,
    type,
    furnishingType: PF_FURNISHING_TYPE[listing.furnished] as PFListingPayload["furnishingType"],
    bathrooms: listing.bathrooms ?? undefined,
    bedrooms: listing.bedrooms ? PF_BEDROOMS[listing.bedrooms] : undefined,
    // sizeSqm is stored in square meters internally; Property Finder's unit
    // for this field outside UAE villas isn't confirmed in their docs - see
    // the open question in the integration plan. Sent as-is until confirmed.
    size: listing.sizeSqm ?? undefined,
    title: { en: listing.title!, ...(listing.titleAr ? { ar: listing.titleAr } : {}) },
    description: { en: listing.description!, ...(listing.descriptionAr ? { ar: listing.descriptionAr } : {}) },
    amenities: filterAmenitiesForCategory(listing.propertyCategory, listing.amenities),
    location: { id: listing.pfLocationId! },
    assignedTo: { id: assignedProfileId },
    createdBy: { id: pfUserId },
    price: { type: priceType, amounts: { [priceType]: priceAmount ?? undefined } },
    media: {
      images: listing.images.map((img) => ({
        original: { url: `${baseUrl}/api/listings/${listing.id}/images/${img.id}` },
      })),
    },
  };
}

// Creates (first time) or updates (subsequent) the listing on Property
// Finder, then publishes it. Stores the result on PortalListing (portal =
// PROPERTY_FINDER); on failure, stores the reason so the agent can see why
// it didn't publish.
export async function publishListingToPropertyFinder(listingId: number): Promise<void> {
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { images: { orderBy: { sortOrder: "asc" } }, createdBy: true, portalListings: { where: { portal: PORTAL } } },
  });
  const portalListing = listing.portalListings[0] ?? null;

  const assignedProfileId = effectiveAssignedProfileId(portalListing, listing.createdBy);
  const eligibility = getPropertyFinderEligibility(listing, listing.images, assignedProfileId);
  if (!eligibility.eligible) {
    await prisma.portalListing.upsert({
      where: portalKey(listingId),
      update: { state: "publishing_failed", lastError: eligibility.reasons.join("; "), lastSyncedAt: new Date() },
      create: { listingId, portal: PORTAL, enabled: true, state: "publishing_failed", lastError: eligibility.reasons.join("; "), lastSyncedAt: new Date() },
    });
    throw new Error(eligibility.reasons.join("; "));
  }

  const reference = portalListing?.reference || `LE-${listing.id}`;

  // The per-image route (app/api/listings/[id]/images/[imageId]/route.ts)
  // only serves a photo once its listing has an *enabled* PortalListing row -
  // and that must be true before PF fetches the image URLs we're about to
  // send them (which happens as part of processing createListing/
  // updateListing below), not after. Flipping it to true only on success
  // left every photo 404ing at the exact moment PF tried to ingest them,
  // silently falling back to blank/blurred placeholders on their side.
  await prisma.portalListing.upsert({
    where: portalKey(listingId),
    update: { enabled: true },
    create: { listingId, portal: PORTAL, enabled: true },
  });

  try {
    // PF's own user id for whoever's public profile this listing is assigned
    // to - required for createdBy, and distinct from assignedProfileId (see
    // buildListingPayload). Looked up fresh each publish rather than stored,
    // since it's just derived from the account picker's own directory call.
    const pfUsers = await listUsers();
    const pfUser = pfUsers.find((u) => u.publicProfile?.id === assignedProfileId);
    if (!pfUser) {
      throw new Error(`No active Property Finder user found for public profile ${assignedProfileId}`);
    }
    const payload = buildListingPayload(listing, assignedProfileId!, pfUser.id, reference);

    const remoteListingId = portalListing?.remoteListingId;
    const response = remoteListingId ? await updateListing(remoteListingId, payload) : await createListing(payload);
    const newRemoteListingId = remoteListingId ?? response.id;

    // Publishing needs a publishing type selected (standard/featured/premium)
    // to actually deduct credits and move the listing out of draft - only
    // answered for a listing that exists on PF in draft state, which it now
    // does. Defaults to the cheapest/first option (matches the "Cost to
    // publish" figure already shown to the agent before they hit publish).
    const prices = await getPublishPrice(newRemoteListingId);
    const publishOption = prices.find((p) => p.feature === "publish");
    const publishType = publishOption?.purchasableProducts[0]?.name;
    if (!publishType) {
      throw new Error("Property Finder didn't offer a publishing option for this listing");
    }
    await publishListing(newRemoteListingId, publishType);

    await prisma.portalListing.upsert({
      where: portalKey(listingId),
      update: { remoteListingId: newRemoteListingId, state: "pending_publishing", enabled: true, lastError: null, lastSyncedAt: new Date() },
      create: { listingId, portal: PORTAL, remoteListingId: newRemoteListingId, state: "pending_publishing", enabled: true, lastSyncedAt: new Date() },
    });
  } catch (err) {
    const message = err instanceof PropertyFinderApiError
      ? [err.message, ...err.fieldErrors.map((f) => `${f.pointer ?? ""} ${f.detail ?? ""}`.trim())].join("; ")
      : err instanceof Error
        ? err.message
        : "Failed to reach Property Finder";
    await prisma.portalListing.upsert({
      where: portalKey(listingId),
      update: { state: "publishing_failed", lastError: message, lastSyncedAt: new Date() },
      create: { listingId, portal: PORTAL, enabled: true, state: "publishing_failed", lastError: message, lastSyncedAt: new Date() },
    });
    throw new Error(message);
  }
}

export async function unpublishListingFromPropertyFinder(listingId: number): Promise<void> {
  const portalListing = await prisma.portalListing.findUnique({ where: portalKey(listingId) });
  if (!portalListing?.remoteListingId) {
    await prisma.portalListing.upsert({
      where: portalKey(listingId),
      update: { enabled: false },
      create: { listingId, portal: PORTAL, enabled: false },
    });
    return;
  }

  try {
    await unpublishListing(portalListing.remoteListingId);
  } catch {
    // Best-effort - even if PF's unpublish call fails (e.g. already
    // unpublished), we still record the agent's intent locally.
  }
  await prisma.portalListing.update({
    where: portalKey(listingId),
    data: { enabled: false, lastSyncedAt: new Date() },
  });
}
