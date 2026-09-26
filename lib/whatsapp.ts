import { ListingDTO } from "./types";
import { formatQAR, formatSqm, listingCode } from "./format";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS, unitLabelFor } from "./propertyCategory";

// A ready-to-send WhatsApp inquiry message pre-filled with the listing's own
// details, so tapping "WhatsApp Now" (or any WhatsApp icon) on a listing
// doesn't send a generic "reaching out about a property" text - the agent
// on the other end immediately knows which unit is being asked about.
export function buildListingInquiryMessage(listing: ListingDTO): string {
  const priceLine = listing.listingType === "RENT" ? `${formatQAR(listing.rentPrice)}/month` : formatQAR(listing.salePrice);
  const details = [
    PROPERTY_CATEGORY_LABELS[listing.propertyCategory],
    listing.bedrooms ? BEDROOM_SHORT_LABELS[listing.bedrooms] : null,
    listing.sizeSqm ? formatSqm(listing.sizeSqm) : null,
    priceLine,
  ]
    .filter(Boolean)
    .join(" • ");

  const unit = unitLabelFor(listing.propertyCategory);
  const unitLine = unit.showFloor
    ? `${unit.unitLabel} ${listing.apartmentNumber}, Floor ${listing.floor}`
    : `${unit.unitLabel} ${listing.apartmentNumber}`;

  return [
    `Hi ${listing.createdBy.name}, I'm interested in this listing on Luxury Estates:`,
    "",
    `${listingCode(listing.id)} - ${listing.buildingName}, ${listing.community}, ${listing.area}`,
    unitLine,
    details,
    "",
    "Is this still available?",
  ].join("\n");
}

// A ready-to-send WhatsApp message for an agent sharing a listing with a
// client or contact, pre-filled with the listing's details and a link back
// to the listing page so the recipient can open it directly.
export function buildListingShareMessage(listing: ListingDTO, url: string): string {
  const priceLine = listing.listingType === "RENT" ? `${formatQAR(listing.rentPrice)}/month` : formatQAR(listing.salePrice);
  const details = [
    PROPERTY_CATEGORY_LABELS[listing.propertyCategory],
    listing.bedrooms ? BEDROOM_SHORT_LABELS[listing.bedrooms] : null,
    listing.sizeSqm ? formatSqm(listing.sizeSqm) : null,
    priceLine,
  ]
    .filter(Boolean)
    .join(" • ");

  const unit = unitLabelFor(listing.propertyCategory);
  const unitLine = unit.showFloor
    ? `${unit.unitLabel} ${listing.apartmentNumber}, Floor ${listing.floor}`
    : `${unit.unitLabel} ${listing.apartmentNumber}`;

  return [
    "Check out this listing on Luxury Estates:",
    "",
    `${listingCode(listing.id)} - ${listing.buildingName}, ${listing.community}, ${listing.area}`,
    unitLine,
    details,
    "",
    url,
  ].join("\n");
}
