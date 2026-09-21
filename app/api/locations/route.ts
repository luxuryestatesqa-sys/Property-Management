import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

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
      orderBy: { area: "asc" },
    });
    return NextResponse.json({ values: rows.map((r) => r.area) });
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
