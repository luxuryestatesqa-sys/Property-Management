import { prisma } from "@/lib/prisma";
import { getChannelEligibility } from "@/lib/portals/eligibility";

export interface MasterFeedReport {
  included: number;
  skipped: { id: number; title: string; reasons: string[] }[];
}

// What the admin card shows: of every active listing an agent switched on for
// the master feed, how many actually make it into /feeds/all.xml and, for the
// rest, exactly why not. Uses the same eligibility rule as feed generation
// (lib/feeds/generateFeed.ts), so the numbers match what a portal sees.
export async function getMasterFeedReport(): Promise<MasterFeedReport> {
  const rows = await prisma.listing.findMany({
    where: { status: "ACTIVE", portalListings: { some: { portal: "OTHER_PORTALS", enabled: true } } },
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
  return { included, skipped };
}
