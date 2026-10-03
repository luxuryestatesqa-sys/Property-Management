import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { getEligibilityForPortal } from "@/lib/portals/eligibility";
import { Portal } from "@prisma/client";

// The pull-based channels this route handles - each is just a
// PortalListing.enabled flag read by the public listing page or the
// portal's own feed (app/feeds/[portal]), no external API call involved.
// Property Finder keeps its own dedicated route
// (app/api/listings/[id]/propertyfinder) since publishing there is a real,
// synchronous push to their API with its own stricter eligibility rules.
const CHANNEL_PORTALS = new Set<Portal>(["WEBSITE", "QATAR_LIVING", "PROPERTY_ORYX", "OTHER_PORTALS"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; portal: string }> }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { id, portal: portalParam } = await params;
  const portal = portalParam.toUpperCase() as Portal;
  if (!CHANNEL_PORTALS.has(portal)) {
    return NextResponse.json({ error: "Unknown or unsupported channel" }, { status: 400 });
  }

  const listingId = Number(id);
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { images: { select: { id: true } } },
  });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = listing.createdById === session!.user.id;
  const isAdmin = session!.user.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "You can only publish your own listings" }, { status: 403 });
  }

  const body = await req.json();
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "`enabled` must be a boolean" }, { status: 400 });
  }

  if (body.enabled) {
    const eligibility = getEligibilityForPortal(portal, listing, listing.images);
    if (!eligibility.eligible) {
      return NextResponse.json({ error: "Not ready to publish", reasons: eligibility.reasons }, { status: 400 });
    }
  }

  const state = await prisma.portalListing.upsert({
    where: { listingId_portal: { listingId, portal } },
    update: { enabled: body.enabled },
    create: { listingId, portal, enabled: body.enabled },
  });

  return NextResponse.json({ channelState: state });
}
