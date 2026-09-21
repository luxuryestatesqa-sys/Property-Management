import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const nextStatus = body.status as "ACTIVE" | "INACTIVE";
  if (nextStatus !== "ACTIVE" && nextStatus !== "INACTIVE") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({ where: { id: Number(id) } });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = listing.createdById === session!.user.id;
  const isAdmin = session!.user.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "You can only manage your own listings" }, { status: 403 });
  }

  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data: {
      status: nextStatus,
      deactivatedAt: nextStatus === "INACTIVE" ? new Date() : null,
    },
    include: {
      createdBy: { select: { id: true, name: true, whatsapp: true, avatarUrl: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true, url: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      listingId: listing.id,
      userId: session!.user.id,
      action: nextStatus === "INACTIVE" ? "DEACTIVATED" : "REACTIVATED",
      oldValue: listing.status,
      newValue: nextStatus,
    },
  });

  return NextResponse.json({ listing: updated });
}
