import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { profileUpdateSchema } from "@/lib/validation";

const SELECT = {
  id: true,
  name: true,
  email: true,
  whatsapp: true,
  avatarUrl: true,
  role: true,
  status: true,
  createdAt: true,
} as const;

export async function GET() {
  const { session, db, error } = await requireSession();
  if (error) return error;

  const user = await db!.user.findUnique({
    where: { id: session!.user.id },
    select: SELECT,
  });

  return NextResponse.json({ user });
}

export async function PATCH(req: NextRequest) {
  const { session, db, error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.whatsapp !== undefined) data.whatsapp = parsed.data.whatsapp;
  if (parsed.data.avatarUrl !== undefined) data.avatarUrl = parsed.data.avatarUrl;

  const user = await db!.user.update({
    where: { id: session!.user.id },
    data,
    select: SELECT,
  });

  return NextResponse.json({ user });
}
