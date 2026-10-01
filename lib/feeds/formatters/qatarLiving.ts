import { FeedListing } from "../types";
import { buildGenericListingsXml } from "./genericFormat";

// Qatar Living's real feed spec isn't available yet - this is a clean,
// generic XML shape standing in for it. Swap the body of this function
// (only this file) once their actual spec is confirmed; nothing else in the
// feed pipeline needs to change to support it.
export function formatQatarLivingFeed(listings: FeedListing[]): string {
  return buildGenericListingsXml("qatarliving_listings", listings);
}
