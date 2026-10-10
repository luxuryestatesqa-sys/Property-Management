import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/api-helpers";
import { whatsappSchema, adminResetPasswordSchema } from "@/lib/validation";

// Only the OWNER can touch the OWNER account (deactivate, remove, reset password, change role).
async function ownerProtected(db: NonNullable<Awaited<ReturnType<typeof requireAdmin>>["db"]>, id: string, callerRole: string) {
  const target = await db.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) return { notFound: true as const, forbidden: false };
  return { notFound: false as const, forbidden: target.role === "OWNER" && callerRole !== "OWNER" };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const status = body.status as "ACTIVE" | "INACTIVE" | undefined;

  if (status && status !== "ACTIVE" && status !== "INACTIVE") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  if (id === session!.user.id && status === "INACTIVE") {
    return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 });
  }

  const guard = await ownerProtected(db!, id, session!.user.role);
  if (guard.notFound) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (guard.forbidden) return NextResponse.json({ error: "Only the agency owner can change the owner account" }, { status: 403 });

  let role: "ADMIN" | "MANAGER" | "AGENT" | undefined;
  if (body.role !== undefined) {
    if (!["ADMIN", "MANAGER", "AGENT"].includes(body.role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    if (id === session!.user.id) return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 });
    role = body.role;
  }

  let whatsapp: string | undefined;
  if (body.whatsapp !== undefined) {
    const parsed = whatsappSchema.safeParse(body.whatsapp);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    whatsapp = parsed.data;
  }

  let passwordHash: string | undefined;
  if (body.newPassword !== undefined) {
    const parsed = adminResetPasswordSchema.safeParse({ newPassword: body.newPassword });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  }

  // The agent's Property Finder public profile id, picked by an admin from
  // the real PF account list (see /api/portals/propertyfinder/users) - not
  // free text, so listings this agent publishes are correctly attributed.
  let pfPublicProfileId: number | null | undefined;
  if (body.pfPublicProfileId !== undefined) {
    if (body.pfPublicProfileId !== null && typeof body.pfPublicProfileId !== "number") {
      return NextResponse.json({ error: "Invalid Property Finder profile id" }, { status: 400 });
    }
    pfPublicProfileId = body.pfPublicProfileId;
  }

  const user = await db!.user.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(role ? { role } : {}),
      ...(whatsapp ? { whatsapp } : {}),
      ...(passwordHash ? { passwordHash } : {}),
      ...(pfPublicProfileId !== undefined ? { pfPublicProfileId } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      whatsapp: true,
      avatarUrl: true,
      role: true,
      status: true,
      createdAt: true,
      pfPublicProfileId: true,
    },
  });

  return NextResponse.json({ user });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  if (id === session!.user.id) {
    return NextResponse.json({ error: "You cannot remove your own account" }, { status: 400 });
  }

  const guard = await ownerProtected(db!, id, session!.user.role);
  if (guard.notFound) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (guard.forbidden) return NextResponse.json({ error: "Only the agency owner can remove the owner account" }, { status: 403 });

  const listingCount = await db!.listing.count({ where: { createdById: id } });
  if (listingCount > 0) {
    // Never delete historical listing ownership - deactivate instead of removing.
    const user = await db!.user.update({
      where: { id },
      data: { status: "INACTIVE" },
      select: { id: true, name: true, email: true, whatsapp: true, avatarUrl: true, role: true, status: true, createdAt: true },
    });
    return NextResponse.json({
      user,
      note: "User has existing listings and was deactivated instead of removed, to preserve listing history.",
    });
  }

  await db!.user.delete({ where: { id } });
  return NextResponse.json({ removed: true });
}
