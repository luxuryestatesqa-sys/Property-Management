import { FeedListing } from "./types";
import {
  MAX_TEXT_BYTES,
  ORYX_AMENITY_CODES,
  ORYX_MAX_PHOTOS,
  ORYX_PROPERTY_TYPE,
  ORYX_RESIDENTIAL,
  oryxPhone,
  sentenceCaseIfShouting,
} from "./formatters/propertyOryx";
import { AMENITY_LABELS } from "@/lib/propertyFinder/mapping";

// What a person sees on the Property Oryx page before publishing: a plain list of what Oryx will be
// sent, and what is missing or worth a second look. It reads the very same FeedListing the feed is
// built from, so the review can never disagree with what actually goes out.

export type ProblemLevel = "error" | "warning" | "info";
export interface OryxProblem {
  level: ProblemLevel;
  // Which part of the form to look at: price, photos, title, description, size, bedrooms, bathrooms,
  // location, agent, amenities, listing.
  field: string;
  message: string;
}
export interface OryxField {
  label: string;
  value: string; // in words
  sent: string | null; // exactly what goes into the XML, when it differs from the words
}

export interface ListingState {
  visibility: string;
  status: string;
  availabilityStatus: string;
  photosTotal: number;
}

const PROPERTY_TYPE_WORDS: Record<string, string> = {
  AP: "Apartment",
  VH: "Villa",
  TH: "Townhouse",
  PH: "Penthouse",
  DX: "Duplex",
  CD: "Compound",
  WB: "Whole building",
  OF: "Office space",
  RE: "Retail",
  LP: "Land / plot",
};

export function reviewOryx(l: FeedListing, state: ListingState): { problems: OryxProblem[]; fields: OryxField[] } {
  const problems: OryxProblem[] = [];
  const add = (level: ProblemLevel, field: string, message: string) => problems.push({ level, field, message });
  const residential = ORYX_RESIDENTIAL.has(l.propertyCategory);
  const rent = l.listingType === "RENT";

  // Things that stop it going out at all.
  if (state.visibility !== "SHARED") add("error", "listing", "This listing is private. Make it shared so it can go to portals.");
  if (state.status !== "ACTIVE") add("error", "listing", "This listing is deactivated.");
  if (state.availabilityStatus === "RENTED" || state.availabilityStatus === "SOLD") add("error", "listing", `A ${state.availabilityStatus.toLowerCase()} listing isn't sent to portals.`);
  if (state.photosTotal === 0) add("error", "photos", "Add at least one photo.");
  if (!l.area) add("error", "location", "Choose a location (the city).");
  if (!l.community) add("error", "location", "Choose the community.");
  if (!l.buildingName) add("error", "location", "Add the building or project name.");

  // Worth fixing before it goes live.
  const rawTitle = (l.titleOryx || l.title).trim();
  if (rawTitle.length > 80) add("warning", "title", "The title is long. Oryx asks for a short, descriptive one.");
  if (rawTitle !== sentenceCaseIfShouting(rawTitle)) add("warning", "title", "The title is all capitals, so it will be sent in normal case.");
  if (l.description.length < 80) add("warning", "description", "The description is very short. A good description helps the listing.");
  if (Buffer.byteLength(l.description, "utf8") > MAX_TEXT_BYTES) add("warning", "description", "The description is over 64 KB, so the end will be cut.");
  if (!l.sizeSqm) add("warning", "size", "Add the size. Oryx shows it on the listing.");
  else if (!Number.isInteger(l.sizeSqm)) add("info", "size", `The size is sent as a whole number (${Math.round(l.sizeSqm)}).`);
  if (residential && l.bedrooms === null) add("warning", "bedrooms", "Choose the number of bedrooms.");
  if (residential && (l.bathrooms === null || l.bathrooms <= 0)) add("warning", "bathrooms", "Add the number of bathrooms.");
  if (l.latitude === null || l.longitude === null) add("warning", "location", "No map pin. Choose a Property Finder location so the listing can show on the map.");
  // A local number written without the country code (+974 ...) can't be told apart from a valid one by
  // the feed, so it is flagged here.
  const rawPhone = l.agentPhone ?? "";
  const phoneDigits = rawPhone.replace(/[^\d]/g, "");
  if (!oryxPhone(rawPhone) || (!/^\s*(\+|00)/.test(rawPhone) && phoneDigits.length <= 8)) add("warning", "agent", "The agent's phone needs a country code, such as +974.");
  if (!l.agentEmail) add("warning", "agent", "The agent has no email.");
  if (state.photosTotal > ORYX_MAX_PHOTOS) add("warning", "photos", `Oryx takes up to ${ORYX_MAX_PHOTOS} photos. Only the first ${ORYX_MAX_PHOTOS} are sent.`);
  const sentAmenities = (l.amenityKeys ?? []).filter((k) => ORYX_AMENITY_CODES[k]);
  const skipped = (l.amenityKeys ?? []).filter((k) => !ORYX_AMENITY_CODES[k]);
  if (skipped.length) add("info", "amenities", `Oryx has no code for: ${skipped.map((k) => AMENITY_LABELS[k] ?? k).join(", ")}. They aren't sent.`);
  if (!l.titleAr && !l.descriptionAr) add("info", "title", "No Arabic text. It is optional.");
  add("info", "listing", "The permit number is sent as 00000 for every listing.");

  const typeCode = ORYX_PROPERTY_TYPE[l.propertyCategory] ?? "AP";
  const offering = `${residential ? "R" : "C"}${rent ? "R" : "S"}`;
  const fields: OryxField[] = [
    { label: "Reference number", value: l.reference, sent: null },
    { label: "Offering", value: `${residential ? "Residential" : "Commercial"} for ${rent ? "rent" : "sale"}`, sent: offering },
    { label: "Property type", value: PROPERTY_TYPE_WORDS[typeCode] ?? typeCode, sent: typeCode },
    { label: "Price", value: `QAR ${Math.round(l.price).toLocaleString("en-US")}${rent ? " per month" : ""}`, sent: String(Math.round(l.price)) },
    { label: "City", value: l.area || "—", sent: null },
    { label: "Community", value: l.community || "—", sent: null },
    { label: "Sub-community", value: l.subcommunity || l.community || "—", sent: null },
    { label: "Property name", value: l.buildingName || "—", sent: null },
    { label: "Title (English)", value: sentenceCaseIfShouting(rawTitle) || "—", sent: null },
    { label: "Title (Arabic)", value: l.titleAr || "Not added", sent: null },
    { label: "Description (English)", value: `${l.description.length} characters`, sent: null },
    { label: "Description (Arabic)", value: l.descriptionAr ? `${l.descriptionAr.length} characters` : "Not added", sent: null },
    { label: "Amenities", value: sentAmenities.length ? sentAmenities.map((k) => AMENITY_LABELS[k] ?? k).join(", ") : "None", sent: sentAmenities.map((k) => ORYX_AMENITY_CODES[k]).join(",") || null },
    { label: "Size", value: l.sizeSqm ? `${Math.round(l.sizeSqm)} sqm` : "Not set", sent: l.sizeSqm ? String(Math.round(l.sizeSqm)) : null },
    ...(residential
      ? [
          { label: "Bedrooms", value: l.bedrooms === null ? "Not set" : l.bedrooms === 0 ? "Studio" : String(l.bedrooms), sent: l.bedrooms === null ? null : String(l.bedrooms >= 10 ? "10+" : l.bedrooms) },
          { label: "Bathrooms", value: l.bathrooms && l.bathrooms > 0 ? String(l.bathrooms) : "Not set", sent: l.bathrooms && l.bathrooms > 0 ? (l.bathrooms > 7 ? "7+" : String(l.bathrooms)) : null },
        ]
      : []),
    { label: "Furnished", value: l.furnished === "FURNISHED" ? "Yes" : "No", sent: null },
    { label: "Agent", value: [l.agentName, oryxPhone(l.agentPhone), l.agentEmail].filter(Boolean).join(" · ") || "—", sent: null },
    { label: "Photos", value: `${Math.min(state.photosTotal, ORYX_MAX_PHOTOS)} of ${state.photosTotal} sent`, sent: null },
    { label: "Map pin", value: l.latitude !== null && l.longitude !== null ? `${l.latitude}, ${l.longitude}` : "Not set", sent: l.latitude !== null && l.longitude !== null ? `${l.longitude},${l.latitude}` : null },
  ];

  const rank: Record<ProblemLevel, number> = { error: 0, warning: 1, info: 2 };
  problems.sort((a, b) => rank[a.level] - rank[b.level]);
  return { problems, fields };
}
