import { prisma } from "@/lib/prisma";
import type { Listing } from "@prisma/client";
import { pfCategoryAndType, PF_BEDROOMS, PF_FURNISHING_TYPE, filterAmenitiesForCategory } from "./mapping";
import { createListing, updateListing, publishListing, unpublishListing, listUsers, getPublishPrice, getListing, PFListingPayload, PFListingResponse, PropertyFinderApiError } from "./client";

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
// `localFallback` (the origin a pull feed was just requested on) is used only
// when the configured URL is a local one - so a feed still renders while
// testing on localhost, whereas the Property Finder push (no fallback passed)
// keeps refusing a URL the portal could never fetch.
export function getAppBaseUrl(localFallback?: string): string {
  let raw = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");

  // If APP_BASE_URL is unset or a local URL (e.g. http://localhost:3000), but VERCEL_URL exists, use VERCEL_URL
  const isRawLocal = raw ? (raw.includes("localhost") || raw.includes("127.0.0.1") || raw.includes("0.0.0.0")) : true;
  if ((!raw || isRawLocal) && process.env.VERCEL_URL) {
    raw = `https://${process.env.VERCEL_URL}`;
  }

  if (!raw) {
    throw new Error("APP_BASE_URL (or VERCEL_URL) is not set - required to build publicly-fetchable image URLs for Property Finder");
  }

  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    raw = `https://${raw}`;
  }

  const hostname = new URL(raw).hostname;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname);
  if (isLocal) {
    if (localFallback) return localFallback.replace(/\/$/, "");
    throw new Error(
      `APP_BASE_URL is set to ${raw}, which Property Finder can't reach over the public internet - publishing and webhooks will fail. Set APP_BASE_URL in your environment variables to your deployed site's public URL (e.g. https://yourdomain.com), or use a public tunnel while testing locally.`
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
      // Cache-busted with the listing's own updatedAt (which saveListingFields
      // bumps on every publish attempt) so PF always sees a URL it hasn't
      // fetched before - otherwise a URL that failed once (e.g. during the
      // enabled-flag race this app used to have) can stay cached as broken on
      // their side indefinitely, even after our fix, since the URL itself
      // never changes between updates.
      images: listing.images.map((img) => {
        const imageUrl = `${baseUrl}/api/listings/${listing.id}/images/${img.id}.jpg?v=${Date.now()}`;
        return {
          original: { url: imageUrl },
        };
      }),
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
      throw new Error(`No Property Finder user found for public profile ${assignedProfileId} - re-link the agent's Property Finder account`);
    }
    // An inactive PF user is accepted by the API but the listing then shows
    // "The agent could not be found" in Expert and its public page 404s.
    if (pfUser.status !== "active") {
      throw new Error(`The Property Finder account for ${pfUser.publicProfile?.name ?? `profile ${assignedProfileId}`} is inactive - activate it in Property Finder Expert or assign this listing to another agent`);
    }
    const payload = buildListingPayload(listing, assignedProfileId!, pfUser.id, reference);

    const remoteListingId = portalListing?.remoteListingId;
    let response: PFListingResponse;
    let isNewRemoteListing = !remoteListingId;
    if (remoteListingId) {
      try {
        response = await updateListing(remoteListingId, payload);
      } catch (err) {
        // A 404 here means PF no longer recognizes this id at all (seen in
        // practice as "The listing was not found or you do not have access
        // to it") - the stored remoteListingId is stale (e.g. PF expired or
        // otherwise dropped it). Retrying update forever can never succeed,
        // so self-heal by creating a fresh listing in the same attempt
        // instead of leaving the agent stuck with no path forward short of
        // the manual admin-only reset action.
        if (err instanceof PropertyFinderApiError && err.status === 404) {
          response = await createListing(payload);
          isNewRemoteListing = true;
        } else {
          throw err;
        }
      }
    } else {
      response = await createListing(payload);
    }
    const newRemoteListingId = isNewRemoteListing ? response.id : remoteListingId!;

    // Persist the id the moment we have it, before the two steps below that
    // can still fail - create/update had already fully succeeded on PF's
    // side at this point (a real listing now exists there under this
    // reference), and previously this was only saved after publishListing
    // ALSO succeeded. If getPublishPrice/publishListing then failed, the
    // catch block below recorded the failure but never learned this id, so
    // the listing sat on PF fully created (and blocking that reference from
    // ever being reused) while this app still thought remoteListingId was
    // null - the next attempt would call createListing again with the same
    // reference and PF would correctly reject it as a duplicate, forever.
    if (isNewRemoteListing) {
      await prisma.portalListing.update({ where: portalKey(listingId), data: { remoteListingId: newRemoteListingId, lastSyncedAt: new Date() } });
    }

    // Publishing needs a publishing type selected (standard/featured/premium)
    // to actually deduct credits and move the listing out of draft - only
    // answered for a listing that's still in DRAFT state on PF's side (see
    // the same caveat in credits/route.ts). A listing being updated here for
    // the second-plus time is very likely already past draft (pending/live),
    // in which case getPublishPrice/publishListing legitimately 404 with
    // "not found" - that 404 does NOT mean the update above failed or that
    // the listing is inaccessible, it means there's no publish step left to
    // do. Treating it as a hard failure was exactly why updating an already-
    // live listing kept wrongly showing "not found" as if it needed fixing.
    // This app only ever publishes at the cheapest (standard) tier -
    // featured/premium are paid upgrades an agent can still apply manually
    // from PF Expert, but shouldn't be picked implicitly from here. Picking
    // by lowest price rather than matching the name "standard" exactly,
    // since PF's actual product name for that tier isn't confirmed (their
    // schema docs are behind a login) and a strict name match broke on a
    // real response that didn't include that literal string.
    let finalState = "pending_publishing";
    try {
      const prices = await getPublishPrice(newRemoteListingId);
      const publishOption = prices.find((p) => p.feature === "publish");
      const cheapestProduct = publishOption?.purchasableProducts.reduce<(typeof publishOption.purchasableProducts)[number] | null>(
        (min, p) => (min === null || p.price.total < min.price.total ? p : min),
        null
      );
      if (!cheapestProduct) {
        throw new Error("Property Finder didn't offer any publishing option for this listing");
      }
      try {
        await publishListing(newRemoteListingId, "standard");
      } catch {
        await publishListing(newRemoteListingId, cheapestProduct.name);
      }
    } catch (publishErr) {
      if (publishErr instanceof PropertyFinderApiError && publishErr.status === 404) {
        // Already past draft - the update we just sent still applied. The
        // next status refresh (refreshPropertyFinderListingStatus) will
        // correct this to PF's exact real stage right after.
        finalState = "live";
      } else {
        throw publishErr;
      }
    }

    await prisma.portalListing.upsert({
      where: portalKey(listingId),
      update: { remoteListingId: newRemoteListingId, state: finalState, enabled: true, lastError: null, lastSyncedAt: new Date() },
      create: { listingId, portal: PORTAL, remoteListingId: newRemoteListingId, state: finalState, enabled: true, lastSyncedAt: new Date() },
    });
  } catch (err) {
    const message = err instanceof PropertyFinderApiError
      ? [err.message, ...err.fieldErrors.map((f) => [f.pointer, f.title, f.detail].filter(Boolean).join(": "))].join("; ")
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

// Unpublishes (like above) but also forgets the remote listing id, so the
// next publish calls createListing instead of updateListing - a distinct,
// deliberate recovery action, not the default unpublish behavior, since most
// agents unpublishing/republishing want to resume the SAME PF listing (kept
// lead history, quality score) rather than start a new one each time.
// Exists for the one real case that needs it: a listing PF appears to have
// permanently cached a bad photo fetch for, where updateListing calls never
// re-trigger a fresh image fetch on their side no matter what URL is sent.
export async function resetPropertyFinderListing(listingId: number): Promise<void> {
  const portalListing = await prisma.portalListing.findUnique({ where: portalKey(listingId) });
  if (!portalListing) return;

  if (portalListing.remoteListingId) {
    try {
      await unpublishListing(portalListing.remoteListingId);
    } catch {
      // Best-effort, same as unpublishListingFromPropertyFinder above.
    }
  }

  // Also force a new reference - if PF treats reference as an idempotency/
  // dedup key on create (unconfirmed, but plausible), reusing the same one
  // could route a "new" createListing call back to the same underlying
  // listing even with remoteListingId cleared, carrying forward whatever
  // made its photos stick as broken.
  const baseReference = portalListing.reference || `LE-${listingId}`;
  const newReference = `${baseReference}-r${Date.now().toString(36).slice(-4)}`;

  await prisma.portalListing.update({
    where: portalKey(listingId),
    data: { remoteListingId: null, state: null, lastError: null, enabled: false, reference: newReference, lastSyncedAt: new Date() },
  });
}

export interface PropertyFinderStatus {
  remoteListingId: string | null;
  // PF's own raw state.stage string (e.g. draft/live/takendown/archived per
  // PortalListing.state's own field comment) - stored verbatim, not mapped
  // into this app's own pending_publishing/publishing_failed vocabulary,
  // since that vocabulary is this app's own invention for states PF hasn't
  // confirmed yet (webhook-derived), not a translation of PF's real enum.
  stage: string | null;
  reasons: string[];
}

// Pulls the listing's actual current state directly from PF (GET
// /v1/listings/{id}) rather than only ever relying on the webhook - the
// webhook requires PF to be correctly configured to call back to this app AND
// for that delivery to succeed, neither of which is guaranteed (and can't be
// observed from here if it silently isn't happening). This is the
// authoritative alternative: ask PF directly, right now, what it thinks this
// listing's state is, and persist exactly that.
export async function refreshPropertyFinderListingStatus(listingId: number): Promise<PropertyFinderStatus | null> {
  const portalListing = await prisma.portalListing.findUnique({ where: portalKey(listingId) });
  if (!portalListing?.remoteListingId) return null;

  const response = await getListing(portalListing.remoteListingId);
  const stage = response.state?.stage ?? null;
  const reasons = response.state?.reasons?.map((r) => r.en).filter(Boolean) ?? [];

  // Keep this app's own "published" flag in step with what Property Finder
  // actually reports, so a listing live there is never shown here as merely
  // "ready to publish" (and one PF unpublished/took down isn't shown live).
  const enabledPatch =
    stage === "live" ? { enabled: true } : stage === "unpublished" || stage === "archived" || stage === "takendown" ? { enabled: false } : {};

  await prisma.portalListing.update({
    where: portalKey(listingId),
    data: { state: stage, ...enabledPatch, lastError: reasons.length > 0 ? reasons.join("; ") : null, lastSyncedAt: new Date() },
  });

  return { remoteListingId: portalListing.remoteListingId, stage, reasons };
}
