import { feedLocationFor } from "@/lib/propertyFinder/location";
import { QATAR_AREAS, QATAR_COMMUNITIES_BY_AREA } from "@/lib/qatarLocations";

// Looks over a listing's PUBLIC free text (title + description, the only
// parts of a feed an agent types or an AI writes) for things that must not be
// there or that disagree with the structured fields. It only reports - the
// admin decides what to fix - and runs on the data the feeds publish.
export interface AuditListing {
  title: string | null;
  description: string | null;
  area: string;
  community: string;
  // Property Finder's saved location - when set, this (not area/community) is
  // the location the feeds publish, so it's what the text is compared with.
  pfLocation?: unknown;
  buildingName: string;
  apartmentNumber: string;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerWhatsapp: string | null;
  titleDeedNumber: string | null;
}

export interface AuditAgent {
  whatsapp: string;
  email: string;
}

const PHONE = /\+?\d[\d\s().-]{5,}\d/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const digitsOf = (s: string) => s.replace(/\D/g, "");

// Same number with or without the country code / leading zeros.
function sameNumber(a: string, b: string): boolean {
  const x = digitsOf(a).replace(/^0+/, "");
  const y = digitsOf(b).replace(/^0+/, "");
  if (x.length < 6 || y.length < 6) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}

function mentions(text: string, needle: string): boolean {
  const n = needle.trim();
  if (n.length < 3) return false;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

// Every area and community this app knows, used to spot a description that
// talks about a different place than the listing's own location fields.
const KNOWN_PLACES: string[] = (() => {
  const names = new Set<string>(QATAR_AREAS);
  for (const communities of Object.values(QATAR_COMMUNITIES_BY_AREA)) communities.forEach((c) => names.add(c));
  // Too generic to mean "a different location" when they appear in prose.
  for (const generic of ["Doha", "Qatar", "Corniche", "Al Souq"]) names.delete(generic);
  return [...names];
})();

export function auditPublicText(listing: AuditListing, agent: AuditAgent): string[] {
  const text = `${listing.title ?? ""}\n${listing.description ?? ""}`;
  if (!text.trim()) return [];
  const issues: string[] = [];
  const phonesInText = [...new Set(text.match(PHONE) ?? [])];

  for (const phone of phonesInText) {
    if (!sameNumber(phone, agent.whatsapp)) issues.push(`has a phone number that isn't the agent's (${phone.trim()})`);
  }
  for (const email of new Set(text.match(EMAIL) ?? [])) {
    if (email.toLowerCase() !== agent.email.toLowerCase()) issues.push(`has an email address that isn't the agent's (${email})`);
  }

  if (listing.ownerName && mentions(text, listing.ownerName)) issues.push("mentions the owner's name");
  if ([listing.ownerPhone, listing.ownerWhatsapp].some((num) => num && phonesInText.some((p) => sameNumber(p, num)))) {
    issues.push("contains the owner's phone number");
  }
  if (listing.titleDeedNumber && text.includes(listing.titleDeedNumber)) issues.push("contains the title deed number");
  if (mentions(text, listing.buildingName)) issues.push("names the building");
  if (listing.apartmentNumber.length >= 3 && mentions(text, listing.apartmentNumber)) issues.push("mentions the unit number");

  const location = feedLocationFor({ area: listing.area, community: listing.community, pfLocation: listing.pfLocation ?? null });
  const area = location.area.toLowerCase();
  const community = location.community.toLowerCase();
  const wrong = KNOWN_PLACES.filter((place) => {
    const p = place.toLowerCase();
    if (!mentions(text, place)) return false;
    // The listing's own area/community, or a name containing/contained by one, is fine.
    return !(area.includes(p) || community.includes(p) || p.includes(area) || (community !== "" && p.includes(community)));
  });
  if (wrong.length > 0) {
    issues.push(`talks about ${wrong.join(", ")} but the listing's location is ${location.path.replace(/, /g, " / ")}`);
  }

  return issues;
}
