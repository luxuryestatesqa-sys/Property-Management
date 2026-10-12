import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireSession } from "@/lib/api-helpers";
import { passwordSchema } from "@/lib/validation";
import { verifyPassword, setIdentityPassword, IdentityError } from "@/lib/identity";

export async function PATCH(req: NextRequest) {
  const { session, db, error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const currentPassword = body.currentPassword as string | undefined;
  const parsed = passwordSchema.safeParse(body.newPassword);

  if (!currentPassword || !parsed.success) {
    return NextResponse.json({ error: parsed.success ? "Current password is required" : parsed.error.flatten() }, { status: 400 });
  }
  const newPassword = parsed.data;

  const user = await db!.user.findUnique({ where: { id: session!.user.id } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const valid = await verifyPassword(user, currentPassword).catch((e) => {
    if (e instanceof IdentityError) return null;
    throw e;
  });
  if (valid === null) return NextResponse.json({ error: "Couldn't check your password right now. Please try again." }, { status: 502 });
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  try {
    await setIdentityPassword(user.id, newPassword);
  } catch {
    return NextResponse.json({ error: "Couldn't change your password right now. Please try again." }, { status: 502 });
  }
  await db!.user.update({ where: { id: user.id }, data: { passwordHash } });

  return NextResponse.json({ success: true });
}
