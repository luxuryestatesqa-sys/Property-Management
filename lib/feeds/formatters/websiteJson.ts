import { FeedListing } from "../types";

// Unlike the portal formatters (XML, per each portal's own import format),
// the website feed is consumed by your own site's templates, not a third
// party's importer - JSON is far easier to work with there, so this returns
// a plain array rather than reusing the generic XML builder.
export function formatWebsiteFeed(listings: FeedListing[]): string {
  const items = listings.map((l) => ({
    id: l.id,
    reference: l.reference,
    listingType: l.listingType,
    propertyType: l.propertyCategoryLabel,
    bedrooms: l.bedroomsLabel,
    bathrooms: l.bathrooms,
    sizeSqm: l.sizeSqm,
    title: l.title,
    description: l.description,
    price: l.price,
    priceType: l.priceType,
    furnished: l.furnished === "FURNISHED",
    availability: l.availabilityStatus.toLowerCase(),
    location: {
      area: l.area,
      community: l.community,
      building: l.buildingName,
      country: "Qatar",
    },
    images: l.images,
    updatedAt: l.updatedAt.toISOString(),
  }));
  return JSON.stringify({ count: items.length, listings: items });
}
