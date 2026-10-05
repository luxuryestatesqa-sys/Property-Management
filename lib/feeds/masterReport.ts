import { prisma } from "@/lib/prisma";
import { getChannelEligibility } from "@/lib/portals/eligibility";
import { auditPublicText } from "./audit";

export interface MasterFeedReport {
  included: number;
  skipped: { id: number; title: string; reasons: string[] }[];
  // Listings live on any feed whose public title/description needs a look:
  // someone else's phone/email, owner or building details, or a location that
  // disagrees with the listing's own area/community.
  textWarnings: { id: number; title: string; issues: string[] }[];
}

// What the admin card shows: of every active listing an agent switched on for
// the master feed, how many actually make it into /feeds/all.xml and, for the
// rest, exactly why not. Uses the same eligibility rule as feed generation
// (lib/feeds/generateFeed.ts), so the numbers match what a portal sees.
export async function getMasterFeedReport(): Promise<MasterFeedReport> {
  const rows = await prisma.listing.findMany({
    where: { status: "ACTIVE", visibility: "SHARED", portalListings: { some: { portal: "OTHER_PORTALS", enabled: true } } },
    include: { images: { select: { id: true } } },
    orderBy: { id: "asc" },
  });

  let included = 0;
  const skipped: MasterFeedReport["skipped"] = [];
  for (const listing of rows) {
    const { eligible, reasons } = getChannelEligibility(listing, listing.images);
    if (eligible) included++;
    else skipped.push({ id: listing.id, title: listing.title?.trim() || `Listing #${listing.id}`, reasons });
  }

  const published = await prisma.listing.findMany({
    where: { status: "ACTIVE", visibility: "SHARED", portalListings: { some: { enabled: true } } },
    include: { createdBy: { select: { whatsapp: true, email: true } } },
    orderBy: { id: "asc" },
  });
  const textWarnings: MasterFeedReport["textWarnings"] = [];
  for (const listing of published) {
    const issues = auditPublicText(listing, listing.createdBy);
    if (issues.length > 0) textWarnings.push({ id: listing.id, title: listing.title?.trim() || `Listing #${listing.id}`, issues });
  }

  return { included, skipped, textWarnings };
}
