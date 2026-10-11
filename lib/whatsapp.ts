import { ListingDTO } from "./types";
import { formatQAR, formatSqm, listingCode } from "./format";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS, unitSummary } from "./propertyCategory";

// A ready-to-send WhatsApp inquiry message pre-filled with the listing's own
// details, so tapping "WhatsApp Now" (or any WhatsApp icon) on a listing
// doesn't send a generic "reaching out about a property" text - the agent
// on the other end immediately knows which unit is being asked about.
export function buildListingInquiryMessage(listing: ListingDTO, agencyName = "our agency"): string {
  const priceLine = listing.listingType === "RENT" ? `${formatQAR(listing.rentPrice)}/month` : formatQAR(listing.salePrice);
  const details = [
    PROPERTY_CATEGORY_LABELS[listing.propertyCategory],
    listing.bedrooms ? BEDROOM_SHORT_LABELS[listing.bedrooms] : null,
    listing.sizeSqm ? formatSqm(listing.sizeSqm) : null,
    priceLine,
  ]
    .filter(Boolean)
    .join(" • ");

  const unitLine = unitSummary(listing, false);

  return [
    `Hi ${listing.createdBy.name}, I'm interested in this listing on ${agencyName}:`,
    "",
    `${listingCode(listing.id)} - ${listing.buildingName}, ${listing.community}, ${listing.area}`,
    ...(unitLine ? [unitLine] : []),
    details,
    "",
    "Is this still available?",
  ].join("\n");
}

// A ready-to-send WhatsApp message for an agent sharing a listing with a
// client or contact, pre-filled with the listing's details and a link back
// to the listing page so the recipient can open it directly.
export function buildListingShareMessage(listing: ListingDTO, url: string, agencyName = "our agency"): string {
  const priceLine = listing.listingType === "RENT" ? `${formatQAR(listing.rentPrice)}/month` : formatQAR(listing.salePrice);
  const details = [
    PROPERTY_CATEGORY_LABELS[listing.propertyCategory],
    listing.bedrooms ? BEDROOM_SHORT_LABELS[listing.bedrooms] : null,
    listing.sizeSqm ? formatSqm(listing.sizeSqm) : null,
    priceLine,
  ]
    .filter(Boolean)
    .join(" • ");

  const unitLine = unitSummary(listing, false);

  return [
    `Check out this listing on ${agencyName}:`,
    "",
    `${listingCode(listing.id)} - ${listing.buildingName}, ${listing.community}, ${listing.area}`,
    ...(unitLine ? [unitLine] : []),
    details,
    "",
    url,
  ].join("\n");
}

// First message an agent sends to a new lead from the Leads page.
export function buildWhatsAppLeadMessage(leadName: string, agencyName: string, propertyName: string | null): string {
  const first = leadName.trim().split(/\s+/)[0] || "there";
  return propertyName
    ? `Hi ${first}, thank you for your interest in ${propertyName} with ${agencyName}. How can I help you?`
    : `Hi ${first}, thank you for contacting ${agencyName}. How can I help you?`;
}
