import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireAdmin, parseJsonBody } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { orgUpdateSchema } from "@/lib/validation";

// The signed-in user's own agency (name, logo, colour).
export async function GET() {
  const { orgId, error } = await requireSession();
  if (error) return error;
  const org = await prisma.organization.findUnique({ where: { id: orgId! }, select: { id: true, name: true, slug: true, logoUrl: true, brandColor: true } });
  return NextResponse.json({ org });
}

// Admins/owners edit their agency's branding.
export async function PATCH(req: NextRequest) {
  const { orgId, error } = await requireAdmin();
  if (error) return error;

  const { value, error: bodyError } = await parseJsonBody(req);
  if (bodyError) return bodyError;
  const parsed = orgUpdateSchema.safeParse(value);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const org = await prisma.organization.update({
    where: { id: orgId! },
    data: parsed.data,
    select: { id: true, name: true, slug: true, logoUrl: true, brandColor: true },
  });
  return NextResponse.json({ org });
}
