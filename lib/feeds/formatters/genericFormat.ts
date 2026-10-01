import { FeedListing } from "../types";
import { xmlTag, cdataTag } from "../xml";

// Shared building block for portals without a confirmed spec yet
// (Qatar Living, Property Oryx - and Property Finder's own feed placeholder,
// separate from and not used by its real push-API integration in
// lib/propertyFinder/). Each portal still gets its own formatter file
// (formatters/qatarLiving.ts etc.) calling this - once a real spec shows up
// for a portal, only that one file changes.
export function buildGenericListingsXml(rootTag: string, listings: FeedListing[]): string {
  const items = listings.map((l) => buildGenericListingItem(l)).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag} count="${listings.length}">\n${items}\n</${rootTag}>`;
}

function buildGenericListingItem(l: FeedListing): string {
  const images = l.images.map((url) => `<image>${escapeUrl(url)}</image>`).join("");
  return [
    "<listing>",
    xmlTag("id", l.reference),
    xmlTag("listing_type", l.listingType === "RENT" ? "rent" : "sale"),
    xmlTag("property_type", l.propertyCategoryLabel),
    xmlTag("bedrooms", l.bedroomsLabel),
    xmlTag("bathrooms", l.bathrooms),
    xmlTag("size_sqm", l.sizeSqm),
    cdataTag("title", l.title),
    cdataTag("description", l.description),
    xmlTag("price", l.price),
    xmlTag("price_type", l.priceType),
    xmlTag("furnished", l.furnished === "FURNISHED" ? "yes" : "no"),
    xmlTag("availability", l.availabilityStatus.toLowerCase()),
    "<location>",
    xmlTag("area", l.area),
    xmlTag("community", l.community),
    xmlTag("building", l.buildingName),
    xmlTag("country", "Qatar"),
    "</location>",
    `<images>${images}</images>`,
    xmlTag("last_updated", l.updatedAt.toISOString()),
    "</listing>",
  ].join("\n");
}

// Image URLs are already absolute http(s) URLs (built in generateFeed.ts) -
// XML-escaping is enough, no URL-encoding needed.
function escapeUrl(url: string): string {
  return url.replace(/&/g, "&amp;");
}
