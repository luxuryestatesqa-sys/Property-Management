function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildDupKey(
  area: string,
  community: string,
  buildingName: string,
  floor: string,
  apartmentNumber: string
): string {
  // Without a unit number there is nothing to match on, so such a listing is never reported as a duplicate.
  if (!apartmentNumber.trim() || apartmentNumber.trim() === "-") return `no-unit|${globalThis.crypto.randomUUID()}`;
  return [area, community, buildingName, floor, apartmentNumber].map(norm).join("|");
}
