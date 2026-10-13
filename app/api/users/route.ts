import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-helpers";
import { userCreateSchema } from "@/lib/validation";
import { createIdentity } from "@/lib/identity";
import { logActivity } from "@/lib/activity";

export async function GET() {
  const { db, error } = await requireAdmin();
  if (error) return error;

  const users = await db!.user.findMany({
    orderBy: { createdAt: "desc" },
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
      _count: { select: { listings: true } },
    },
  });

  const withActiveCounts = await Promise.all(
    users.map(async (u) => {
      const activeCount = await db!.listing.count({
        where: { createdById: u.id, status: "ACTIVE" },
      });
      return { ...u, activeListingsCount: activeCount };
    })
  );

  return NextResponse.json({ users: withActiveCounts });
}

export async function POST(req: NextRequest) {
  const { session, db, orgId, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const parsed = userCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // Emails are unique across all agencies (a login is just an email), so this check
  // deliberately looks beyond the caller's own agency.
  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase().trim() }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await db!.user.create({
    data: {
      name: data.name,
      organizationId: orgId!,
      email: data.email.toLowerCase().trim(),
      whatsapp: data.whatsapp,
      role: data.role,
      passwordHash,
    },
    select: { id: true, name: true, email: true, whatsapp: true, avatarUrl: true, role: true, status: true, createdAt: true },
  });
  void logActivity(orgId!, { type: "user_added", agentId: session!.user.id, newValue: user.role, note: `${user.name} (${user.email})` });
  try {
    await createIdentity({ id: user.id, email: user.email, name: user.name, password: data.password });
  } catch (e) {
    await db!.user.delete({ where: { id: user.id } });
    console.error("add user: identity creation failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't create the sign-in account right now. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ user }, { status: 201 });
}
