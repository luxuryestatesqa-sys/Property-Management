import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Unauthenticated - this backs the public share link, so it must never
// return createdBy, ownerName/ownerPhone/ownerWhatsapp, or any other field
// that could identify or contact the listing's own agent. The only contact
// exposed is the agent named by `?agent=`, i.e. whoever generated the link.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await prisma.listing.findUnique({
    where: { id: Number(id) },
    select: {
      id: true,
      listingType: true,
      propertyCategory: true,
      bedrooms: true,
      sizeSqm: true,
      area: true,
      community: true,
      buildingName: true,
      floor: true,
      apartmentNumber: true,
      rentPrice: true,
      salePrice: true,
      rentalValue: true,
      furnished: true,
      billsStatus: true,
      availabilityStatus: true,
      images: { orderBy: { sortOrder: "asc" }, select: { id: true, url: true } },
    },
  });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const agentId = req.nextUrl.searchParams.get("agent");
  let agent: { name: string; whatsapp: string } | null = null;
  if (agentId) {
    const user = await prisma.user.findUnique({
      where: { id: agentId },
      select: { name: true, whatsapp: true, status: true },
    });
    if (user && user.status === "ACTIVE") {
      agent = { name: user.name, whatsapp: user.whatsapp };
    }
  }

  return NextResponse.json({ listing, agent });
}
