import { chatJson } from "./openai";
import { buildMessages, parseAndFinish, type CopyLang } from "./listingCopy";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_LABELS } from "@/lib/propertyCategory";
import { AMENITY_LABELS, filterAmenitiesForCategory } from "@/lib/propertyFinder/mapping";
import type { BedroomCount, Furnished, ListingType, PropertyCategory } from "@prisma/client";

// The raw listing facts both callers have - the saved listing (Publishing
// Hub) or the not-yet-saved Add Property form - turned into the cleaned
// title + description. One path, so both behave identically.
export interface CopyFacts {
  lang: CopyLang;
  listingType: ListingType;
  propertyCategory: PropertyCategory;
  bedrooms: BedroomCount | null;
  bathrooms: string | null; // Property Finder's stored shape ("none", "1".."20")
  sizeSqm: number | null;
  furnished: Furnished;
  area: string;
  community: string;
  amenities: string[]; // amenity keys
  locationLabel: string | null;
  agentName: string;
  agentPhone: string;
}

export async function generateListingCopy(f: CopyFacts): Promise<{ title: string; description: string }> {
  const amenities = filterAmenitiesForCategory(f.propertyCategory, f.amenities)
    .map((a) => AMENITY_LABELS[a])
    .filter((a): a is string => Boolean(a));

  const { system, user } = buildMessages({
    lang: f.lang,
    listingType: f.listingType,
    category: PROPERTY_CATEGORY_LABELS[f.propertyCategory] ?? f.propertyCategory,
    bedrooms: f.bedrooms ? BEDROOM_LABELS[f.bedrooms] : null,
    bathrooms: f.bathrooms === "none" ? "0" : f.bathrooms,
    sizeSqm: f.sizeSqm,
    furnished: f.furnished,
    area: f.area,
    community: f.community,
    locationLabel: f.locationLabel,
    amenities,
    agentName: f.agentName,
    agentPhone: f.agentPhone,
  });
  const content = await chatJson(system, user);
  return parseAndFinish(content, f.lang, f.agentName, f.agentPhone);
}
