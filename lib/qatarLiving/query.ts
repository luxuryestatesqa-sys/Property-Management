import { prisma } from "@/lib/prisma";
import { getQatarLivingEligibility } from "@/lib/portals/eligibility";
import { toQatarLivingListing, QatarLivingListing } from "./listingMapper";

const LISTING_INCLUDE = {
  images: { orderBy: { sortOrder: "asc" as const }, select: { id: true, createdAt: true } },
  createdBy: { select: { name: true, email: true, whatsapp: true } },
};

// Re-checked here, not just at toggle time - a listing can be edited after
// being enabled for Qatar Living (e.g. its size cleared) and should
// silently drop out of the feed rather than be sent to QL missing a
// required field. Same defence-in-depth pattern as the other pull feeds
// (lib/feeds/generateFeed.ts).
function isEligible(listing: Parameters<typeof getQatarLivingEligibility>[0], images: { id: string }[]): boolean {
  return getQatarLivingEligibility(listing, images).eligible;
}

export interface QatarLivingPage {
  listings: QatarLivingListing[];
  total: number;
}

// Qatar Living's spec requires the full current set of active listings
// across all pages to stay consistent call to call (it diffs against what
// it saw last time to detect removals) - so eligibility is applied in JS
// over every enabled row rather than in the DB query, then paginated
// in-memory, rather than paginating the DB query first and filtering after
// (which could under-fill a page or shift listings between pages as
// eligibility is re-evaluated per request).
export async function getQatarLivingPage(page: number, pageSize: number, updatedSince: Date | null): Promise<QatarLivingPage> {
  const rows = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      portalListings: { some: { portal: "QATAR_LIVING", enabled: true } },
      ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
    },
    include: LISTING_INCLUDE,
    orderBy: { id: "asc" },
  });

  const eligible = rows.filter((listing) => isEligible(listing, listing.images));
  const start = (page - 1) * pageSize;
  const pageRows = eligible.slice(start, start + pageSize);

  return { listings: pageRows.map(toQatarLivingListing), total: eligible.length };
}

export async function getQatarLivingListingByReference(referenceNumber: string): Promise<QatarLivingListing | null> {
  const match = /^LE-(\d+)$/.exec(referenceNumber);
  if (!match) return null;

  const listing = await prisma.listing.findFirst({
    where: {
      id: Number(match[1]),
      status: "ACTIVE",
      portalListings: { some: { portal: "QATAR_LIVING", enabled: true } },
    },
    include: LISTING_INCLUDE,
  });
  if (!listing || !isEligible(listing, listing.images)) return null;

  return toQatarLivingListing(listing);
}
