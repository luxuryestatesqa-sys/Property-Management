import { FeedListing } from "../types";
import { xmlTag, cdataTag, joinTags } from "../xml";
import { agentXml, amenitiesXml, imagesXml } from "./shared";

// Shared building block for portals without a confirmed spec yet
// (Property Oryx - and Property Finder's own feed placeholder,
// separate from and not used by its real push-API integration in
// lib/propertyFinder/). Each portal still gets its own formatter file
// (formatters/propertyOryx.ts etc.) calling this - once a real spec shows up
// for a portal, only that one file changes.
export function buildGenericListingsXml(rootTag: string, listings: FeedListing[]): string {
  const items = listings.map((l) => buildGenericListingItem(l)).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag} count="${listings.length}">\n${items}\n</${rootTag}>`;
}

function buildGenericListingItem(l: FeedListing): string {
  return joinTags([
    "<listing>",
    xmlTag("id", l.reference),
    xmlTag("listing_type", l.listingType === "RENT" ? "rent" : "sale"),
    xmlTag("property_type", l.propertyCategoryLabel),
    xmlTag("bedrooms", l.bedrooms),
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
    xmlTag("subcommunity", l.subcommunity),
    xmlTag("building", l.buildingName),
    xmlTag("country", "Qatar"),
    xmlTag("latitude", l.latitude),
    xmlTag("longitude", l.longitude),
    "</location>",
    amenitiesXml(l),
    agentXml(l),
    imagesXml(l),
    xmlTag("last_updated", l.updatedAt.toISOString()),
    "</listing>",
  ]);
}
