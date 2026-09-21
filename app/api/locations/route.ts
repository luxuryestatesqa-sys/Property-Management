import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { QATAR_AREAS, QATAR_COMMUNITIES_BY_AREA, QATAR_LOCATION_SUGGESTIONS, LocationSuggestion } from "@/lib/qatarLocations";

// Merges real DB values with a curated list, case-insensitively deduped and
// sorted, so suggestions are useful even where no listing exists yet.
function mergeDeduped(dbValues: string[], curated: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const value of [...dbValues, ...curated]) {
    const key = value.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(value);
  }
  merged.sort((a, b) => a.localeCompare(b));
  return merged;
}

// Returns distinct location values to power cascading pickers.
// ?level=combined -> single-field {area, community, display} suggestions
// ?level=area -> all areas
// ?level=community&area=X -> communities within area X
// ?level=building&area=X&community=Y -> buildings within area+community
export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const level = sp.get("level") ?? "area";
  const area = sp.get("area") ?? undefined;
  const community = sp.get("community") ?? undefined;

  if (level === "combined") {
    const rows = await prisma.listing.findMany({
      where: { status: "ACTIVE" },
      select: { area: true, community: true },
      distinct: ["area", "community"],
    });
    const seen = new Set<string>();
    const merged: LocationSuggestion[] = [];
    for (const s of [
      ...rows.map((r) => ({ area: r.area, community: r.community, display: `${r.community}, ${r.area}` })),
      ...QATAR_LOCATION_SUGGESTIONS,
    ]) {
      const key = `${s.area.trim().toLowerCase()}|${s.community.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(s);
    }
    merged.sort((a, b) => a.display.localeCompare(b.display));
    return NextResponse.json({ suggestions: merged });
  }

  if (level === "area") {
    const rows = await prisma.listing.findMany({
      where: { status: "ACTIVE" },
      select: { area: true },
      distinct: ["area"],
    });
    return NextResponse.json({ values: mergeDeduped(rows.map((r) => r.area), QATAR_AREAS) });
  }

  if (level === "community") {
    const rows = await prisma.listing.findMany({
      where: { status: "ACTIVE", ...(area ? { area } : {}) },
      select: { community: true },
      distinct: ["community"],
    });
    const curated = area ? (QATAR_COMMUNITIES_BY_AREA[area.trim().toLowerCase()] ?? []) : [];
    return NextResponse.json({ values: mergeDeduped(rows.map((r) => r.community), curated) });
  }

  if (level === "building") {
    const rows = await prisma.listing.findMany({
      where: {
        status: "ACTIVE",
        ...(area ? { area } : {}),
        ...(community ? { community } : {}),
      },
      select: { buildingName: true },
      distinct: ["buildingName"],
      orderBy: { buildingName: "asc" },
    });
    return NextResponse.json({ values: rows.map((r) => r.buildingName) });
  }

  return NextResponse.json({ values: [] });
}
