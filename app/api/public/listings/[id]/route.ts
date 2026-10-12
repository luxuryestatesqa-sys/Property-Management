import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withImageLinks } from "@/lib/listingImages";

// Unauthenticated - this backs the public share link, so it must never
// return createdBy, ownerName/ownerPhone/ownerWhatsapp, or any other field
// that could identify or contact the listing's own agent. The only contact
// exposed is the agent named by `?agent=`, i.e. whoever generated the link.
// The floor and unit number are deliberately never selected: a client sees the
// building, never the exact unit, whatever the listing's own privacy setting.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Links carry the listing's random shareToken. Links sent before tokens existed used the plain
  // listing number; they keep working until ALLOW_NUMERIC_SHARE_LINKS=false is set.
  const numeric = /^\d+$/.test(id);
  if (numeric && process.env.ALLOW_NUMERIC_SHARE_LINKS === "false") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const listing = await prisma.listing.findFirst({
    where: numeric ? { id: Number(id) } : { shareToken: id },
    select: {
      id: true,
      organizationId: true,
      listingType: true,
      propertyCategory: true,
      bedrooms: true,
      sizeSqm: true,
      area: true,
      community: true,
      buildingName: true,
      title: true,
      description: true,
      amenities: true,
      rentPrice: true,
      salePrice: true,
      rentalValue: true,
      furnished: true,
      billsStatus: true,
      availabilityStatus: true,
      images: { orderBy: { sortOrder: "asc" }, select: { id: true, createdAt: true } },
    },
  });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const org = await prisma.organization.findUnique({ where: { id: listing.organizationId }, select: { name: true, logoUrl: true, status: true } });
  if (!org || org.status !== "ACTIVE") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const agentId = req.nextUrl.searchParams.get("agent");
  let agent: { name: string; whatsapp: string } | null = null;
  if (agentId) {
    const user = await prisma.user.findUnique({
      where: { id: agentId },
      select: { name: true, whatsapp: true, status: true, organizationId: true },
    });
    // The contact must belong to the same agency as the listing - a share link
    // can never be pointed at another agency's agent.
    if (user && user.status === "ACTIVE" && user.organizationId === listing.organizationId) {
      agent = { name: user.name, whatsapp: user.whatsapp };
    }
  }

  // organizationId is internal; only the agency's public name/logo are returned.
  const { organizationId: _organizationId, ...publicListing } = listing;
  void _organizationId;
  return NextResponse.json({ listing: { ...publicListing, images: withImageLinks(listing.id, listing.images) }, agent, org: { name: org.name, logoUrl: org.logoUrl } });
}
