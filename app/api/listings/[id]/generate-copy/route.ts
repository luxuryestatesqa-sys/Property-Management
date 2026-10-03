import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { OpenAiNotConfiguredError } from "@/lib/ai/openai";
import { generateListingCopy } from "@/lib/ai/generateCopy";

function fieldFrom(value: unknown): "title" | "description" | "both" {
  return value === "title" || value === "description" ? value : "both";
}

// Writes a Property Finder title + description for one SAVED listing from its
// details (plus the amenities/location the agent has on screen but may not
// have saved yet). Returns text only - nothing is saved here; the agent
// reviews/edits it and saves with the rest of the form.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const listing = await prisma.listing.findUnique({
    where: { id: Number(id) },
    include: { createdBy: { select: { name: true, whatsapp: true } } },
  });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = listing.createdById === session!.user.id;
  const isAdmin = session!.user.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "You can only generate text for your own listings" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(
      await generateListingCopy({
        lang: body.lang === "ar" ? "ar" : "en",
        field: fieldFrom(body.field),
        currentTitle: typeof body.currentTitle === "string" ? body.currentTitle : undefined,
        listingType: listing.listingType,
        propertyCategory: listing.propertyCategory,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        sizeSqm: listing.sizeSqm,
        furnished: listing.furnished,
        area: listing.area,
        community: listing.community,
        amenities: Array.isArray(body.amenities) ? body.amenities.filter((a: unknown): a is string => typeof a === "string") : listing.amenities,
        locationLabel: typeof body.locationLabel === "string" ? body.locationLabel.trim().slice(0, 150) || null : null,
        agentName: listing.createdBy.name,
        agentPhone: listing.createdBy.whatsapp,
      })
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to generate text" }, { status: err instanceof OpenAiNotConfiguredError ? 503 : 502 });
  }
}
