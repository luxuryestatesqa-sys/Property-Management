// The shape every per-portal formatter works from - already flattened and
// fully resolved (labels, absolute image URLs, a single price/priceType)
// so a formatter file is just markup, never a query or a lookup table.
export interface FeedListing {
  id: number;
  reference: string;
  listingType: "RENT" | "SALE";
  propertyCategory: string;
  propertyCategoryLabel: string;
  bedroomsLabel: string | null;
  bathrooms: string | null;
  sizeSqm: number | null;
  title: string;
  description: string;
  area: string;
  community: string;
  buildingName: string;
  price: number;
  priceType: "monthly" | "sale";
  furnished: "FURNISHED" | "UNFURNISHED";
  availabilityStatus: string;
  images: string[];
  updatedAt: Date;
}

// `body` rather than `xml` - the Website feed is JSON, not XML, and shares
// this same result shape.
export interface FeedResult {
  body: string;
  etag: string;
}
