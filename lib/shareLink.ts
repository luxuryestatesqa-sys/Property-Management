// The public, unauthenticated URL for a listing, attributing it to the agent
// generating the link (`agentId`) rather than whoever originally created the
// listing - see app/listing/[id]/page.tsx and app/api/public/listings/[id].
// The link carries the listing's random shareToken, not its sequential number,
// so other listings can't be found by counting.
export function buildListingShareUrl(listing: { id: number; shareToken?: string | null }, agentId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/listing/${listing.shareToken || listing.id}?agent=${agentId}`;
}
