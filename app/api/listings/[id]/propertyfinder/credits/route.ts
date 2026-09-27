import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { effectiveAssignedProfileId } from "@/lib/propertyFinder/sync";
import { getCreditBalance, getCreditsSpent, getPublishPrice, describePropertyFinderError } from "@/lib/propertyFinder/client";

const PORTAL = "PROPERTY_FINDER" as const;

// Credit info scoped to THIS listing and the specific Property Finder
// account it publishes under - not the company-wide total, and not
// browsable for a listing you don't own/manage (same access rule as the
// publish toggle route).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const listingId = Number(id);
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { createdBy: { select: { pfPublicProfileId: true } }, portalListings: { where: { portal: PORTAL } } },
  });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = listing.createdById === session!.user.id;
  const isAdmin = session!.user.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "You can only view this for your own listings" }, { status: 403 });
  }

  const portalListing = listing.portalListings[0] ?? null;
  const assignedProfileId = effectiveAssignedProfileId(portalListing, listing.createdBy);

  try {
    // Each Property Finder account has its own credit pool - pass the
    // account this listing actually publishes under, not the company total.
    const accountBalance = assignedProfileId ? await getCreditBalance(assignedProfileId) : null;

    let usedByThisListing: number | null = null;
    let estimatedCost: number | null = null;
    if (portalListing?.remoteListingId) {
      const spent = await getCreditsSpent([portalListing.remoteListingId]);
      usedByThisListing = spent.listings.find((l) => l.listingId === portalListing.remoteListingId)?.totalSpent ?? 0;

      try {
        // Only answers for a listing still in draft state on Property
        // Finder's side - a 404/error here just means "not applicable right
        // now" (e.g. already live), not a real failure.
        const prices = await getPublishPrice(portalListing.remoteListingId);
        const publishOption = prices.find((p) => p.feature === "publish");
        estimatedCost = publishOption?.purchasableProducts[0]?.price.total ?? null;
      } catch {
        estimatedCost = null;
      }
    }

    return NextResponse.json({ accountBalance, usedByThisListing, estimatedCost });
  } catch (err) {
    return NextResponse.json({ error: describePropertyFinderError(err) }, { status: 502 });
  }
}
