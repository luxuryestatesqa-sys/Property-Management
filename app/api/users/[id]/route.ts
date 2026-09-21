import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-helpers";
import { whatsappSchema, adminResetPasswordSchema } from "@/lib/validation";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAdmin();
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

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(whatsapp ? { whatsapp } : {}),
      ...(passwordHash ? { passwordHash } : {}),
    },
    select: { id: true, name: true, email: true, whatsapp: true, avatarUrl: true, role: true, status: true, createdAt: true },
  });

  return NextResponse.json({ user });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  if (id === session!.user.id) {
    return NextResponse.json({ error: "You cannot remove your own account" }, { status: 400 });
  }

  const listingCount = await prisma.listing.count({ where: { createdById: id } });
  if (listingCount > 0) {
    // Never delete historical listing ownership - deactivate instead of removing.
    const user = await prisma.user.update({
      where: { id },
      data: { status: "INACTIVE" },
      select: { id: true, name: true, email: true, whatsapp: true, avatarUrl: true, role: true, status: true, createdAt: true },
    });
    return NextResponse.json({
      user,
      note: "User has existing listings and was deactivated instead of removed, to preserve listing history.",
    });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ removed: true });
}
