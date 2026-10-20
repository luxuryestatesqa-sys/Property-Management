import { can } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { refreshPropertyFinderListingStatus } from "@/lib/propertyFinder/sync";
import { describePropertyFinderError } from "@/lib/propertyFinder/client";

const PORTAL = "PROPERTY_FINDER" as const;

// Pulls this listing's actual current state directly from Property Finder
// (GET /v1/listings/{id}) and persists it - the authoritative alternative to
// waiting on their webhook, which requires PF to be correctly configured to
// call back here and for that delivery to actually succeed, neither of which
// this app can observe on its own if it silently isn't happening.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const listingId = Number(id);
  const listing = await db!.listing.findUnique({ where: { id: listingId }, select: { createdById: true } });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = listing.createdById === session!.user.id;
  const isAdmin = can(session!.user, "listings.editAll");
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "You can only view this for your own listings" }, { status: 403 });
  }

  try {
    await refreshPropertyFinderListingStatus(orgId!, listingId);
  } catch (err) {
    return NextResponse.json({ error: describePropertyFinderError(err) }, { status: 502 });
  }

  const state = await db!.portalListing.findUnique({ where: { listingId_portal: { listingId, portal: PORTAL } } });
  return NextResponse.json({ propertyFinderState: state });
}
