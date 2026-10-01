import type { Listing, Portal } from "@prisma/client";
import { effectiveAssignedProfileId, getPropertyFinderEligibility } from "@/lib/propertyFinder/sync";

export interface ChannelEligibility {
  eligible: boolean;
  reasons: string[];
}

// Shared minimum bar for the pull-based channels (WEBSITE, QATAR_LIVING,
// PROPERTY_ORYX - each just a feed/page reading straight off the Listing
// table, unlike Property Finder's push API with its own stricter shape
// requirements). Reused by the channel-toggle route and by feed generation
// itself, so a listing edited after being enabled to drop a required field
// (e.g. its last photo removed) simply falls out of the feed rather than
// appearing broken there.
export function getChannelEligibility(
  listing: Pick<Listing, "title" | "description" | "listingType" | "rentPrice" | "salePrice" | "area" | "community" | "buildingName">,
  images: { id: string }[]
): ChannelEligibility {
  const reasons: string[] = [];

  const price = listing.listingType === "RENT" ? listing.rentPrice : listing.salePrice;
  if (!price) reasons.push(listing.listingType === "RENT" ? "Set a rent price" : "Set a sale price");

  if (images.length === 0) reasons.push("Add at least one photo");
  if (!listing.area) reasons.push("Set the area");
  if (!listing.community) reasons.push("Set the community");
  if (!listing.buildingName) reasons.push("Set the building name");

  return { eligible: reasons.length === 0, reasons };
}

// Single entry point the channel-toggle route and feed generation both call,
// so which check applies to which portal lives in exactly one place.
// Property Finder keeps its own existing, stricter, push-API-specific check
// (lib/propertyFinder/sync.ts) - untouched by this feature.
export function getEligibilityForPortal(
  portal: Portal,
  listing: Pick<
    Listing,
    "title" | "description" | "listingType" | "rentPrice" | "salePrice" | "area" | "community" | "buildingName" | "bathrooms" | "propertyCategory" | "pfLocationId"
  >,
  images: { id: string }[],
  options: { portalListing?: { assignedProfileId: number | null } | null; createdBy?: { pfPublicProfileId: number | null } } = {}
): ChannelEligibility {
  if (portal === "PROPERTY_FINDER") {
    const assignedProfileId = options.createdBy ? effectiveAssignedProfileId(options.portalListing, options.createdBy) : null;
    return getPropertyFinderEligibility(listing, images, assignedProfileId);
  }
  return getChannelEligibility(listing, images);
}
