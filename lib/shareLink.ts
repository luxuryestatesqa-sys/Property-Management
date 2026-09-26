// The public, unauthenticated URL for a listing, attributing it to the agent
// generating the link (`agentId`) rather than whoever originally created the
// listing - see app/listing/[id]/page.tsx and app/api/public/listings/[id].
export function buildListingShareUrl(listingId: number, agentId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/listing/${listingId}?agent=${agentId}`;
}
