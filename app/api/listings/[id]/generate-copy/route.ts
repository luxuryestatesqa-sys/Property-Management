import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { chatJson, OpenAiNotConfiguredError } from "@/lib/ai/openai";
import { AiCopyError, buildMessages, parseAndFinish, type CopyLang } from "@/lib/ai/listingCopy";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_LABELS } from "@/lib/propertyCategory";
import { AMENITY_LABELS, filterAmenitiesForCategory } from "@/lib/propertyFinder/mapping";

// Writes a Property Finder title + description for one listing from its saved
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
  const lang: CopyLang = body.lang === "ar" ? "ar" : "en";
  const amenitySource: string[] = Array.isArray(body.amenities) ? body.amenities.filter((a: unknown): a is string => typeof a === "string") : listing.amenities;
  const locationLabel = typeof body.locationLabel === "string" ? body.locationLabel.trim().slice(0, 150) || null : null;

  const amenities = filterAmenitiesForCategory(listing.propertyCategory, amenitySource)
    .map((a) => AMENITY_LABELS[a])
    .filter((a): a is string => Boolean(a));

  const input = {
    lang,
    listingType: listing.listingType,
    category: PROPERTY_CATEGORY_LABELS[listing.propertyCategory] ?? listing.propertyCategory,
    bedrooms: listing.bedrooms ? BEDROOM_LABELS[listing.bedrooms] : null,
    bathrooms: listing.bathrooms,
    sizeSqm: listing.sizeSqm,
    furnished: listing.furnished,
    area: listing.area,
    community: listing.community,
    locationLabel,
    amenities,
    agentName: listing.createdBy.name,
    agentPhone: listing.createdBy.whatsapp,
  };

  try {
    const { system, user } = buildMessages(input);
    const content = await chatJson(system, user);
    return NextResponse.json(parseAndFinish(content, lang, input.agentName, input.agentPhone));
  } catch (err) {
    const status = err instanceof OpenAiNotConfiguredError ? 503 : err instanceof AiCopyError ? 502 : 502;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to generate text" }, { status });
  }
}
