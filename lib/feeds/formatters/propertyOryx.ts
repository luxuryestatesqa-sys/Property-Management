import { FeedListing } from "../types";
import { cdataTag, escapeXml, joinTags, xmlTag } from "../xml";
import { ORYX_AMENITY_CODES, ORYX_MAX_PHOTOS, ORYX_PROPERTY_TYPE, ORYX_RESIDENTIAL } from "../oryxCodes";

// Re-exported so existing imports of these keep working.
export { ORYX_AMENITY_CODES, ORYX_MAX_PHOTOS, ORYX_PROPERTY_TYPE, ORYX_RESIDENTIAL };

// Property Oryx pulls this feed. It follows the "myCRM private site" XML specification (Qatar) and its
// sample file: <list last_update=".." listing_count=".."> holding one <property last_update=".."> per
// listing. Property Finder's own integration (lib/propertyFinder/) is separate and not touched here.

const MAX_PHOTOS = ORYX_MAX_PHOTOS;
export const MAX_TEXT_BYTES = 64 * 1024 - 1024; // the specification allows 64 KB; leave room for the markup

// "2025-01-12 12:05:13" (UTC), the timestamp shape the specification uses everywhere.
export function oryxTimestamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function truncateBytes(text: string, max: number): string {
  if (Buffer.byteLength(text, "utf8") <= max) return text;
  let out = text;
  while (Buffer.byteLength(out, "utf8") > max) out = out.slice(0, Math.floor(out.length * 0.95));
  return out.trimEnd();
}

// "Keep it short and descriptive, don't use all UPPERCASE letters."
export function sentenceCaseIfShouting(title: string): string {
  const letters = title.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4 || title !== title.toUpperCase()) return title;
  const lower = title.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// Phone with the country code, as "+97455500001".
export function oryxPhone(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/[^\d]/g, "").replace(/^00/, "");
  return digits.length >= 6 ? `+${digits}` : undefined;
}

function bathrooms(n: number | null): string | undefined {
  if (n === null || n <= 0) return undefined;
  return n > 7 ? "7+" : String(n);
}

function bedrooms(n: number | null): string | undefined {
  if (n === null) return undefined;
  return n >= 10 ? "10+" : String(n);
}

export function oryxPropertyXml(l: FeedListing): string {
  const rent = l.listingType === "RENT";
  const residential = ORYX_RESIDENTIAL.has(l.propertyCategory);
  const offering = `${residential ? "R" : "C"}${rent ? "R" : "S"}`; // RR, RS, CR, CS
  const amenityCodes = (l.amenityKeys ?? []).map((k) => ORYX_AMENITY_CODES[k]).filter((c): c is string => Boolean(c));
  const phone = oryxPhone(l.agentPhone);
  const agent = joinTags([cdataTag("name", l.agentName), xmlTag("email", l.agentEmail), xmlTag("phone", phone)]);
  const photos = l.images.slice(0, MAX_PHOTOS).map((url, i) => {
    const when = l.imageDates?.[i] ?? l.updatedAt;
    return `<url last_update="${oryxTimestamp(when)}">${escapeXml(url)}</url>`;
  });

  return joinTags([
    `<property last_update="${oryxTimestamp(l.updatedAt)}">`,
    xmlTag("permit_number", "00000"),
    xmlTag("reference_number", l.reference),
    xmlTag("offering_type", offering),
    xmlTag("property_type", ORYX_PROPERTY_TYPE[l.propertyCategory] ?? "AP"),
    xmlTag("price_on_application", "No"),
    xmlTag("price", Math.round(l.price)),
    rent ? xmlTag("rental_period", "M") : "",
    cdataTag("city", l.area),
    cdataTag("community", l.community),
    cdataTag("sub_community", l.subcommunity || l.community),
    cdataTag("property_name", l.buildingName),
    cdataTag("title_en", sentenceCaseIfShouting(l.title)),
    cdataTag("title_ar", l.titleAr ? sentenceCaseIfShouting(l.titleAr) : undefined),
    cdataTag("description_en", truncateBytes(l.description, MAX_TEXT_BYTES)),
    cdataTag("description_ar", l.descriptionAr ? truncateBytes(l.descriptionAr, MAX_TEXT_BYTES) : undefined),
    amenityCodes.length ? xmlTag("amenities", amenityCodes.join(",")) : "",
    l.sizeSqm ? xmlTag("size", Math.round(l.sizeSqm)) : "", // whole numbers only, as the specification asks
    residential ? xmlTag("bedroom", bedrooms(l.bedrooms)) : "",
    residential ? xmlTag("bathroom", bathrooms(l.bathrooms)) : "",
    agent ? joinTags(["<agent>", agent, "</agent>"]) : "",
    xmlTag("furnished", l.furnished === "FURNISHED" ? "Yes" : "No"),
    photos.length ? joinTags(["<photo>", ...photos, "</photo>"]) : "",
    l.latitude !== null && l.longitude !== null ? xmlTag("geopoints", `${l.longitude},${l.latitude}`) : "", // longitude first
    "</property>",
  ]);
}

export function formatPropertyOryxFeed(listings: FeedListing[]): string {
  // The feed's own timestamp is the newest change in it, so it only moves when something does.
  const newest = listings.reduce((max, l) => (l.updatedAt > max ? l.updatedAt : max), new Date(0));
  const stamp = listings.length ? newest : new Date();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<list last_update="${oryxTimestamp(stamp)}" listing_count="${listings.length}">\n${listings.map(oryxPropertyXml).join("\n")}\n</list>`;
}
