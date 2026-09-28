import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
  const { session, error } = await requireSession();
  if (error) return error;
  if (session!.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only an admin can reset a Property Finder listing" }, { status: 403 });
  }

  const { id } = await params;
  const listingId = Number(id);
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { id: true } });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await resetPropertyFinderListing(listingId);

  const state = await prisma.portalListing.findUnique({ where: { listingId_portal: { listingId, portal: PORTAL } } });
  return NextResponse.json({ propertyFinderState: state });
}
