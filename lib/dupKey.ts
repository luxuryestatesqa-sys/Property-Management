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
  return [area, community, buildingName, floor, apartmentNumber].map(norm).join("|");
}
