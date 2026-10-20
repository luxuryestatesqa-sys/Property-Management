import { reachOf, reaches } from "@/lib/scope";
import { can } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { resetPropertyFinderListing } from "@/lib/propertyFinder/sync";

const PORTAL = "PROPERTY_FINDER" as const;

// Admin-only recovery action: unpublishes on Property Finder's side (if a
// remote listing exists) and forgets the remote listing id locally, so the
// next Save & Publish creates a brand-new PF listing instead of updating the
// old one. Distinct from the normal unpublish toggle - see
// resetPropertyFinderListing's own comment for why this needs to be a
// separate, deliberate action rather than unpublish's default behavior.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, scope: teamScope, error } = await requireSession();
  if (error) return error;
  if (!can(session!.user, "listings.editAll")) {
    return NextResponse.json({ error: "Only an admin can reset a Property Finder listing" }, { status: 403 });
  }

  const { id } = await params;
  const listingId = Number(id);
  const listing = await db!.listing.findUnique({ where: { id: listingId }, select: { id: true, createdById: true } });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!reaches(reachOf(session!.user, "listings.editAll", teamScope), listing.createdById)) {
    return NextResponse.json({ error: "Only an admin can reset a Property Finder listing" }, { status: 403 });
  }

  await resetPropertyFinderListing(orgId!, listingId);

  const state = await db!.portalListing.findUnique({ where: { listingId_portal: { listingId, portal: PORTAL } } });
  return NextResponse.json({ propertyFinderState: state });
}
