// The shape every per-portal formatter works from - already flattened and
// fully resolved (labels, absolute image URLs, a single price/priceType)
// so a formatter file is just markup, never a query or a lookup table.
export interface FeedListing {
  id: number;
  reference: string;
  listingType: "RENT" | "SALE";
  propertyCategory: string;
  propertyCategoryLabel: string;
  bedrooms: number | null; // 0 = studio, null for categories without bedrooms
  bathrooms: number | null;
  sizeSqm: number | null;
  title: string;
  description: string;
  // The location Property Finder shows for this listing (what the agent chose
  // when publishing there), or the listing's own area/community if none yet.
  area: string;
  community: string;
  subcommunity: string;
  latitude: number | null;
  longitude: number | null;
  buildingName: string;
  price: number;
  priceType: "monthly" | "sale";
  furnished: "FURNISHED" | "UNFURNISHED";
  availabilityStatus: string;
  amenities: string[]; // readable labels (e.g. "Balcony"), already filtered to the property type
  images: string[];
  updatedAt: Date;
  // The listing's own agent, as the public contact - the only staff details
  // that ever reach a feed.
  agentName?: string;
  agentPhone?: string;
  agentEmail?: string;
}

// `body` rather than `xml` - the Website feed is JSON, not XML, and shares
// this same result shape.
export interface FeedResult {
  body: string;
  etag: string;
}
