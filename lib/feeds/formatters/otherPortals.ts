import { FeedListing } from "../types";
import { xmlTag, cdataTag } from "../xml";

// The master feed any portal other than Property Finder can pull. Unlike the
// generic per-portal shape (genericFormat.ts) it never emits the building
// name - exact unit details stay internal, same rule as the Property Finder
// push - and it carries the listing's agent as the contact.
export function formatOtherPortalsFeed(listings: FeedListing[]): string {
  const items = listings.map(buildItem).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<listings count="${listings.length}">\n${items}\n</listings>`;
}

function buildItem(l: FeedListing): string {
  const images = l.images.map((url) => `<image>${url.replace(/&/g, "&amp;")}</image>`).join("");
  return [
    "<listing>",
    xmlTag("reference", l.reference),
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
    xmlTag("country", "Qatar"),
    "</location>",
    "<agent>",
    xmlTag("name", l.agentName),
    xmlTag("phone", l.agentPhone),
    "</agent>",
    `<images>${images}</images>`,
    xmlTag("last_updated", l.updatedAt.toISOString()),
    "</listing>",
  ].join("\n");
}
