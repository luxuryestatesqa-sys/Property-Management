// Owner/title-deed details an agent enters for their own reference. These
// must never reach any other agent's browser - only the listing's own
// creator or an admin may see the real values. Every API route that returns
// listing data (list, detail, duplicates, create-duplicate-check) must run
// its results through redactPrivateFields before responding.
export const PRIVATE_LISTING_FIELDS = [
  "ownerName",
  "ownerPhone",
  "ownerWhatsapp",
  "titleDeedNumber",
  "privateNotes",
  "titleDeedImage",
  "authorizationFormImage",
] as const;

export type PrivateListingField = (typeof PRIVATE_LISTING_FIELDS)[number];

export function canViewPrivateDetails(createdById: string, viewerId: string, viewerIsAdmin: boolean): boolean {
  return viewerIsAdmin || createdById === viewerId;
}

// Redacted fields are nulled out rather than omitted, so a viewer can't tell
// "empty" apart from "hidden from you" - that distinction is itself private.
export function redactPrivateFields<T extends { createdById: string }>(
  listing: T,
  viewerId: string,
  viewerIsAdmin: boolean
): T {
  if (canViewPrivateDetails(listing.createdById, viewerId, viewerIsAdmin)) return listing;
  const redacted = { ...listing };
  for (const field of PRIVATE_LISTING_FIELDS) {
    (redacted as Record<string, unknown>)[field] = null;
  }
  return redacted;
}

export function redactPrivateFieldsList<T extends { createdById: string }>(
  listings: T[],
  viewerId: string,
  viewerIsAdmin: boolean
): T[] {
  return listings.map((l) => redactPrivateFields(l, viewerId, viewerIsAdmin));
}
