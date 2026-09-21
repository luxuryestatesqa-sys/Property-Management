import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { passwordSchema } from "@/lib/validation";

export async function PATCH(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const currentPassword = body.currentPassword as string | undefined;
  const parsed = passwordSchema.safeParse(body.newPassword);

  if (!currentPassword || !parsed.success) {
    return NextResponse.json({ error: parsed.success ? "Current password is required" : parsed.error.flatten() }, { status: 400 });
  }
  const newPassword = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: session!.user.id } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return NextResponse.json({ success: true });
}
