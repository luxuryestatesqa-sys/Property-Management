import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { OpenAiNotConfiguredError } from "@/lib/ai/openai";
import { generateListingCopy } from "@/lib/ai/generateCopy";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_LABELS } from "@/lib/propertyCategory";

// Same generator as /api/listings/[id]/generate-copy, for the Add Property
// form where the listing doesn't exist yet: takes the form's own values, and
// uses the signed-in agent's own name and number for the call to action.
export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body || !(body.propertyCategory in PROPERTY_CATEGORY_LABELS)) {
    return NextResponse.json({ error: "Choose a property type first" }, { status: 400 });
  }
  const area = typeof body.area === "string" ? body.area.trim() : "";
  if (!area) return NextResponse.json({ error: "Enter the location first" }, { status: 400 });

  const me = await prisma.user.findUnique({ where: { id: session!.user.id }, select: { name: true, whatsapp: true } });
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const size = Number(body.sizeSqm);
  try {
    return NextResponse.json(
      await generateListingCopy({
        lang: "en",
        listingType: body.listingType === "SALE" ? "SALE" : "RENT",
        propertyCategory: body.propertyCategory,
        bedrooms: body.bedrooms in BEDROOM_LABELS ? body.bedrooms : null,
        bathrooms: typeof body.bathrooms === "string" && body.bathrooms ? body.bathrooms : null,
        sizeSqm: Number.isFinite(size) && size > 0 ? size : null,
        furnished: body.furnished === "UNFURNISHED" ? "UNFURNISHED" : "FURNISHED",
        area,
        community: typeof body.community === "string" ? body.community.trim() : "",
        amenities: Array.isArray(body.amenities) ? body.amenities.filter((a: unknown): a is string => typeof a === "string") : [],
        locationLabel: null,
        agentName: me.name,
        agentPhone: me.whatsapp,
      })
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to generate text" }, { status: err instanceof OpenAiNotConfiguredError ? 503 : 502 });
  }
}
