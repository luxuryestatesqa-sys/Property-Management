import { FeedListing } from "../types";
import { buildGenericListingsXml } from "./genericFormat";

// Property Finder's own confirmed integration is the real-time push API in
// lib/propertyFinder/ (create/update/publish via their Enterprise API) -
// that stays exactly as it is and is not affected by this feed. This
// formatter exists only because a pf.xml feed URL was requested alongside
// the other portals; it's a generic placeholder pull-based feed, not part
// of the working PF integration.
export function formatPropertyFinderFeed(listings: FeedListing[]): string {
  return buildGenericListingsXml("propertyfinder_listings", listings);
}
