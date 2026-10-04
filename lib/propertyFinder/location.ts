import { searchLocationById } from "./client";

// What gets stored in Listing.pfLocation: Property Finder's own description of
// the location an agent picked on the publish page. The listing itself only
// keeps the numeric id (pfLocationId); this snapshot is what makes that id
// readable, so feeds and AI copy can show the same location Property Finder
// shows without calling Property Finder on every feed fetch.
export interface PfLocationSnapshot {
  id: number;
  name: string;
  type: string;
  tree: { id: number; name: string; type: string }[]; // outermost first, ends with the location itself
  latitude: number | null;
  longitude: number | null;
}

// The location fields every feed outputs. Same shape whether it came from the
// Property Finder location or from the listing's own area/community.
export interface FeedLocation {
  area: string; // the city/district, e.g. Lusail
  community: string; // e.g. Al Erkyah City ("" if the location is only a city)
  subcommunity: string; // a tower/building inside the community when PF has one
  path: string; // "Lusail, Al Erkyah City"
  latitude: number | null;
  longitude: number | null;
  fromPropertyFinder: boolean;
}

function isSnapshot(value: unknown): value is PfLocationSnapshot {
  const v = value as PfLocationSnapshot | null;
  return Boolean(v && typeof v.id === "number" && typeof v.name === "string" && Array.isArray(v.tree));
}

export function parsePfLocation(value: unknown): PfLocationSnapshot | null {
  return isSnapshot(value) ? value : null;
}

// Looks the chosen location up on Property Finder. Returns null (never
// throws) if Property Finder is unreachable or doesn't know the id, so a
// listing save is never blocked by it - the feed then just falls back to the
// listing's own area/community until the next successful lookup.
export async function fetchPfLocationSnapshot(id: number): Promise<PfLocationSnapshot | null> {
  try {
    const found = await searchLocationById(id);
    if (!found) return null;
    return {
      id: found.id,
      name: found.name,
      type: found.type,
      tree: found.tree,
      latitude: found.coordinates?.lat ?? null,
      longitude: found.coordinates?.lng ?? null,
    };
  } catch {
    return null;
  }
}

export function feedLocationFor(listing: { area: string; community: string; pfLocation: unknown }): FeedLocation {
  const pf = parsePfLocation(listing.pfLocation);
  if (!pf) {
    return {
      area: listing.area,
      community: listing.community,
      subcommunity: "",
      path: [listing.area, listing.community].filter(Boolean).join(", "),
      latitude: null,
      longitude: null,
      fromPropertyFinder: false,
    };
  }
  const nameOf = (type: string) => pf.tree.find((t) => t.type === type)?.name ?? "";
  const city = nameOf("CITY") || pf.tree[0]?.name || pf.name;
  const community = nameOf("COMMUNITY");
  return {
    area: city,
    community,
    subcommunity: nameOf("SUBCOMMUNITY"),
    path: pf.tree.map((t) => t.name).join(", ") || pf.name,
    latitude: pf.latitude,
    longitude: pf.longitude,
    fromPropertyFinder: true,
  };
}
