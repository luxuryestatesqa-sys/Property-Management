import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { isAdminRole } from "@/lib/roles";
import { MAX_LISTING_IMAGES } from "@/lib/constants";
import { listingImageSchema } from "@/lib/validation";

const bodySchema = z.object({
  images: z.array(listingImageSchema).min(1).max(MAX_LISTING_IMAGES),
  // Photos the caller is about to drop in the same edit: they don't count against the limit while this
  // batch is added. The save that follows sets the final list, which is never more than the limit.
  ignoreIds: z.array(z.string()).optional(),
});

// Adds photos to the end of a listing. A listing can hold many photos, but one request can't carry
// them all, so the add and edit screens send them in small batches through here, then save the final
// order (and any removals) with one small request.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const listingId = Number(id);
  if (!Number.isInteger(listingId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const listing = await db!.listing.findUnique({ where: { id: listingId }, select: { createdById: true } });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (listing.createdById !== session!.user.id && !isAdminRole(session!.user.role)) {
    return NextResponse.json({ error: "You can only edit your own listings" }, { status: 403 });
  }

  const { value: body, error: bodyError } = await parseJsonBody(req);
  if (bodyError) return bodyError;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid photos" }, { status: 400 });
  const { images, ignoreIds = [] } = parsed.data;

  const existing = await db!.listingImage.findMany({ where: { listingId }, orderBy: { sortOrder: "asc" }, select: { id: true, sortOrder: true } });
  const counted = existing.filter((e) => !ignoreIds.includes(e.id)).length;
  if (counted + images.length > MAX_LISTING_IMAGES) {
    return NextResponse.json({ error: `Up to ${MAX_LISTING_IMAGES} photos allowed` }, { status: 400 });
  }

  const start = (existing[existing.length - 1]?.sortOrder ?? -1) + 1;
  const created = await db!.listingImage.createManyAndReturn({
    data: images.map((url, i) => ({ listingId, url, sortOrder: start + i })),
    select: { id: true, sortOrder: true },
  });
  // Photos changed, so portals reading the feed should see the listing as updated.
  await db!.listing.update({ where: { id: listingId }, data: { updatedAt: new Date() } });

  created.sort((a, b) => a.sortOrder - b.sortOrder);
  return NextResponse.json({ images: created.map((c) => ({ id: c.id })) }, { status: 201 });
}
