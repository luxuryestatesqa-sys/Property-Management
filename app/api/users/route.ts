import { can, effectivePermissions, isSuperAdminRole, normalizePermissions } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-helpers";
import { userCreateSchema } from "@/lib/validation";
import { createIdentity } from "@/lib/identity";
import { logActivity } from "@/lib/activity";

export async function GET() {
  const { db, orgId, error } = await requirePermission("users.manage");
  if (error) return error;
  const org = await prisma.organization.findUnique({ where: { id: orgId! }, select: { rolePermissions: true } });

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
      permissions: true,
      team: { select: { id: true, name: true } },
      managedTeams: { select: { id: true, name: true } },
      _count: { select: { listings: true } },
    },
  });

  const withActiveCounts = await Promise.all(
    users.map(async (u) => {
      const activeCount = await db!.listing.count({
        where: { createdById: u.id, status: "ACTIVE" },
      });
      const { permissions: saved, ...rest } = u;
      // `permissions` is what the person can do now; `customPermissions` says whether it was set for them
      // personally (true) or follows the role's template (false).
      return { ...rest, activeListingsCount: activeCount, permissions: effectivePermissions(u.role, saved, org?.rolePermissions as never), customPermissions: Array.isArray(saved) };
    })
  );

  return NextResponse.json({ users: withActiveCounts });
}

export async function POST(req: NextRequest) {
  const { session, db, orgId, error } = await requirePermission("users.manage");
  if (error) return error;

  const body = await req.json();
  const parsed = userCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // Only the Super Admin (the Owner) can create an Admin. Anyone else who may manage users can only give a new
  // person permissions they hold themselves.
  if (data.role === "ADMIN" && !isSuperAdminRole(session!.user.role)) {
    return NextResponse.json({ error: "Only the Super Admin can add an Admin" }, { status: 403 });
  }
  const permissions = data.permissions === undefined ? null : normalizePermissions(data.permissions);
  if (data.teamId) {
    if (!can(session!.user, "teams.manage")) return NextResponse.json({ error: "You don't have permission to put people in teams" }, { status: 403 });
    if (data.role === "ADMIN") return NextResponse.json({ error: "Admins are not part of a team" }, { status: 400 });
    if (!(await db!.team.findFirst({ where: { id: data.teamId }, select: { id: true } }))) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  if (permissions && permissions.some((p) => !can(session!.user, p))) {
    return NextResponse.json({ error: "You can only give permissions you have yourself" }, { status: 403 });
  }

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
      ...(permissions ? { permissions } : {}),
      ...(data.teamId ? { teamId: data.teamId } : {}),
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
