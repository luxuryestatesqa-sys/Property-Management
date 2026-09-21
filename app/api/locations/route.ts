import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { QATAR_AREAS } from "@/lib/qatarLocations";

// Returns distinct location values to power cascading pickers.
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

  if (level === "area") {
    const rows = await prisma.listing.findMany({
      where: { status: "ACTIVE" },
      select: { area: true },
      distinct: ["area"],
    });
    // Merge in the real areas already in use (case-insensitive) with the
    // curated list of Qatar areas, so suggestions are never empty just
    // because nobody's posted there yet.
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const value of [...rows.map((r) => r.area), ...QATAR_AREAS]) {
      const key = value.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(value);
    }
    merged.sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ values: merged });
  }

  if (level === "community") {
    const rows = await prisma.listing.findMany({
      where: { status: "ACTIVE", ...(area ? { area } : {}) },
      select: { community: true },
      distinct: ["community"],
      orderBy: { community: "asc" },
    });
    return NextResponse.json({ values: rows.map((r) => r.community) });
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
