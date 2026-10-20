import type { Prisma } from "@prisma/client";

// Whole-listing visibility: a PRIVATE listing is seen only by the agent who
// created it (and admins); a SHARED one by every agent. Every query that
// returns listings to a user must include visibleListingsWhere, and every
// single-listing read must check canViewListing.
// Who the viewer reaches: true = every agent's listings, a list = those agents' (a team manager's team), false =
// only their own. Everyone always reaches their own.
export type ListingReach = boolean | readonly string[];
const reachesAll = (reach: ListingReach) => reach === true;
// One person is matched by id; a team by the list of ids.
const creatorFilter = (viewerId: string, reach: ListingReach): string | { in: string[] } => {
  const ids = reachedIds(viewerId, reach);
  return ids.length === 1 ? ids[0] : { in: ids };
};
const reachedIds = (viewerId: string, reach: ListingReach): string[] => (Array.isArray(reach) ? [...new Set([viewerId, ...(reach as string[])])] : [viewerId]);

export function canViewListing(
  listing: { createdById: string; visibility: "PRIVATE" | "SHARED" },
  viewerId: string,
  viewerIsAdmin: ListingReach
): boolean {
  return reachesAll(viewerIsAdmin) || listing.visibility === "SHARED" || reachedIds(viewerId, viewerIsAdmin).includes(listing.createdById);
}

export function visibleListingsWhere(viewerId: string, viewerIsAdmin: ListingReach): Prisma.ListingWhereInput {
  if (reachesAll(viewerIsAdmin)) return {};
  return { OR: [{ visibility: "SHARED" }, { createdById: creatorFilter(viewerId, viewerIsAdmin) }] };
}

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
  "ownerId",
  "leaseEndDate",
] as const;

export type PrivateListingField = (typeof PRIVATE_LISTING_FIELDS)[number];

// Exact-unit fields, hidden only when the creator ticks "unitDetailsPrivate".
// dupKey embeds the floor and unit number, so it goes with them. Blanked to ""
// (the columns are non-null strings); unitDetailsPrivate itself stays visible
// so the UI can say the details exist but are hidden.
export const UNIT_DETAIL_FIELDS = ["floor", "apartmentNumber", "dupKey"] as const;

// Prisma filter fragment: listings whose floor/apartment number the viewer may
// search on. Without it, searching "1204" would reveal which listings hide it.
export function unitDetailsSearchableWhere(viewerId: string, viewerIsAdmin: ListingReach): Prisma.ListingWhereInput {
  if (reachesAll(viewerIsAdmin)) return {};
  return { OR: [{ unitDetailsPrivate: false }, { createdById: creatorFilter(viewerId, viewerIsAdmin) }] };
}

export function canViewPrivateDetails(createdById: string, viewerId: string, viewerIsAdmin: ListingReach): boolean {
  return reachesAll(viewerIsAdmin) || reachedIds(viewerId, viewerIsAdmin).includes(createdById);
}

// Redacted fields are nulled out rather than omitted, so a viewer can't tell
// "empty" apart from "hidden from you" - that distinction is itself private.
export function redactPrivateFields<T extends { createdById: string }>(
  listing: T,
  viewerId: string,
  viewerIsAdmin: ListingReach
): T {
  if (canViewPrivateDetails(listing.createdById, viewerId, viewerIsAdmin)) return listing;
  const redacted = { ...listing } as Record<string, unknown>;
  for (const field of PRIVATE_LISTING_FIELDS) {
    redacted[field] = null;
  }
  if ((listing as { unitDetailsPrivate?: boolean }).unitDetailsPrivate) {
    for (const field of UNIT_DETAIL_FIELDS) {
      if (field in redacted) redacted[field] = "";
    }
    // The audit trail records old/new floor and unit values.
    const logs = redacted.auditLogs;
    if (Array.isArray(logs)) {
      redacted.auditLogs = logs.map((l: { action?: string }) =>
        l.action === "FLOOR_CHANGED" || l.action === "APARTMENT_CHANGED" ? { ...l, oldValue: null, newValue: null } : l
      );
    }
  }
  return redacted as T;
}

export function redactPrivateFieldsList<T extends { createdById: string }>(
  listings: T[],
  viewerId: string,
  viewerIsAdmin: ListingReach
): T[] {
  return listings.map((l) => redactPrivateFields(l, viewerId, viewerIsAdmin));
}
