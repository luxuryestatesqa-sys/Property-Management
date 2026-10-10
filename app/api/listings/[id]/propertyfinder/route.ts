import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import {
  getPropertyFinderEligibility,
  effectiveAssignedProfileId,
  publishListingToPropertyFinder,
  unpublishListingFromPropertyFinder,
  resetPropertyFinderListing,
} from "@/lib/propertyFinder/sync";
import { isAdminRole } from "@/lib/roles";

// Publishing can retry for several seconds while Property Finder finishes creating a new listing.
export const maxDuration = 60;

const PORTAL = "PROPERTY_FINDER" as const;

// Toggles whether a listing is published to Property Finder. Enabling
// triggers a real create-or-update + publish call; Property Finder's publish
// is async, so a successful response here means "accepted," not "confirmed
// live" - see PortalListing.state, kept current by the webhook receiver
// (app/api/portals/propertyfinder/webhook).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const listingId = Number(id);
  const listing = await db!.listing.findUnique({
    where: { id: listingId },
    include: {
      images: { select: { id: true } },
      createdBy: { select: { pfPublicProfileId: true } },
      portalListings: { where: { portal: PORTAL } },
    },
  });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = listing.createdById === session!.user.id;
  const isAdmin = isAdminRole(session!.user.role);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "You can only publish your own listings" }, { status: 403 });
  }

  const body = await req.json();
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "`enabled` must be a boolean" }, { status: 400 });
  }
  if (body.assignedProfileId !== undefined && body.assignedProfileId !== null && typeof body.assignedProfileId !== "number") {
    return NextResponse.json({ error: "`assignedProfileId` must be a number or null" }, { status: 400 });
  }
  if (body.reference !== undefined && body.reference !== null && typeof body.reference !== "string") {
    return NextResponse.json({ error: "`reference` must be a string or null" }, { status: 400 });
  }
  const reference = typeof body.reference === "string" ? body.reference.trim() || null : body.reference;

  // The agent-account override and custom reference can be saved
  // independently of toggling publish state (e.g. the publish page changing
  // them before publishing).
  if (body.assignedProfileId !== undefined || reference !== undefined) {
    await db!.portalListing.upsert({
      where: { listingId_portal: { listingId, portal: PORTAL } },
      update: {
        ...(body.assignedProfileId !== undefined ? { assignedProfileId: body.assignedProfileId } : {}),
        ...(reference !== undefined ? { reference } : {}),
      },
      create: {
        listingId,
        portal: PORTAL,
        ...(body.assignedProfileId !== undefined ? { assignedProfileId: body.assignedProfileId } : {}),
        ...(reference !== undefined ? { reference } : {}),
      },
    });

    // When the listing's own agent picks an account for themselves, remember
    // it as their own account too - so it shows up already selected on any
    // other listing they publish, not just this one. Only when they're
    // acting on their own listing (isOwner): an admin overriding a specific
    // listing on someone else's behalf shouldn't silently change that
    // agent's remembered default.
    if (isOwner && body.assignedProfileId) {
      await db!.user.update({
        where: { id: listing.createdById },
        data: { pfPublicProfileId: body.assignedProfileId },
      });
    }
  }

  if (body.enabled === true) {
    const refreshedState = await db!.portalListing.findUnique({ where: { listingId_portal: { listingId, portal: PORTAL } } });
    const assignedProfileId = effectiveAssignedProfileId(refreshedState, listing.createdBy);
    const eligibility = getPropertyFinderEligibility(listing, listing.images, assignedProfileId);
    if (!eligibility.eligible) {
      return NextResponse.json({ error: "Not ready to publish", reasons: eligibility.reasons }, { status: 400 });
    }
    try {
      await publishListingToPropertyFinder(orgId!, listingId);
    } catch (err) {
      // publishListingToPropertyFinder already persisted the failure detail
      // on PortalListing (state: publishing_failed, lastError) - surface it
      // here too so the caller gets a non-200 instead of a false "Saved."
      const state = await db!.portalListing.findUnique({ where: { listingId_portal: { listingId, portal: PORTAL } } });
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to publish to Property Finder", propertyFinderState: state }, { status: 502 });
    }
  } else if (body.enabled === false) {
    await unpublishListingFromPropertyFinder(orgId!, listingId);
  }

  const state = await db!.portalListing.findUnique({ where: { listingId_portal: { listingId, portal: PORTAL } } });
  return NextResponse.json({ propertyFinderState: state });
}
