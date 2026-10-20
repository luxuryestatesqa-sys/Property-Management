import { Prisma } from "@prisma/client";
import { can, isSuperAdminRole, normalizePermissions, type Permission } from "@/lib/permissions";
import { forgetLiveUsers } from "@/lib/liveUser";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requirePermission } from "@/lib/api-helpers";
import { whatsappSchema, adminResetPasswordSchema } from "@/lib/validation";
import { setIdentityPassword, setIdentityDisabled, deleteIdentity } from "@/lib/identity";
import { logActivity } from "@/lib/activity";

// Only the OWNER (the Super Admin) can touch the OWNER account or an Admin (deactivate, remove, reset password,
// change role or permissions): someone who may manage users but is not the Super Admin cannot reach upward.
async function ownerProtected(db: NonNullable<Awaited<ReturnType<typeof requirePermission>>["db"]>, id: string, callerRole: string) {
  const target = await db.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) return { notFound: true as const, forbidden: false, message: "" };
  if (target.role === "OWNER" && callerRole !== "OWNER") return { notFound: false as const, forbidden: true, message: "Only the agency owner can change the owner account" };
  if (target.role === "ADMIN" && !isSuperAdminRole(callerRole)) return { notFound: false as const, forbidden: true, message: "Only the Super Admin can change an Admin" };
  return { notFound: false as const, forbidden: false, message: "" };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, error } = await requirePermission("users.manage");
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
  if (guard.forbidden) return NextResponse.json({ error: guard.message }, { status: 403 });

  let role: "ADMIN" | "MANAGER" | "AGENT" | undefined;
  if (body.role !== undefined) {
    if (!["ADMIN", "MANAGER", "AGENT"].includes(body.role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    if (id === session!.user.id) return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 });
    if (body.role === "ADMIN" && !isSuperAdminRole(session!.user.role)) return NextResponse.json({ error: "Only the Super Admin can make someone an Admin" }, { status: 403 });
    role = body.role;
  }

  // Permissions: a list of keys, or null to follow the role's template again. You cannot change your own, and
  // you can only give what you have yourself (a Super Admin has everything).
  let permissions: Permission[] | null | undefined;
  if (body.permissions !== undefined) {
    if (id === session!.user.id) return NextResponse.json({ error: "You cannot change your own permissions" }, { status: 400 });
    if (body.permissions === null) permissions = null;
    else if (Array.isArray(body.permissions)) {
      permissions = normalizePermissions(body.permissions);
      const missing = permissions.filter((p) => !can(session!.user, p));
      if (missing.length) return NextResponse.json({ error: "You can only give permissions you have yourself" }, { status: 403 });
    } else return NextResponse.json({ error: "Invalid permissions" }, { status: 400 });
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
    try {
      await setIdentityPassword(id, parsed.data.newPassword);
    } catch (e) {
      console.error("reset password:", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "Couldn't reset the password right now. Please try again." }, { status: 502 });
    }
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

  const before = role ? await db!.user.findUnique({ where: { id }, select: { role: true } }) : null;
  // A new role starts from that role's template unless permissions were chosen in the same change.
  const savedPermissions = permissions !== undefined ? permissions : role && before && before.role !== role ? null : undefined;
  const user = await db!.user.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(role ? { role } : {}),
      ...(whatsapp ? { whatsapp } : {}),
      ...(passwordHash ? { passwordHash } : {}),
      ...(pfPublicProfileId !== undefined ? { pfPublicProfileId } : {}),
      ...(savedPermissions !== undefined ? { permissions: savedPermissions === null ? Prisma.DbNull : savedPermissions } : {}),
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

  if (role && before && before.role !== role) await logActivity(orgId!, { type: "role_changed", agentId: session!.user.id, oldValue: before.role, newValue: role, note: user.name });
  if (status) await setIdentityDisabled(id, status === "INACTIVE");
  if (role || status || permissions !== undefined) forgetLiveUsers();
  if (permissions !== undefined) await logActivity(orgId!, { type: "permissions_changed", agentId: session!.user.id, newValue: permissions === null ? "role template" : `${permissions.length} permissions`, note: user.name });
  return NextResponse.json({ user });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, error } = await requirePermission("users.manage");
  if (error) return error;

  const { id } = await params;
  if (id === session!.user.id) {
    return NextResponse.json({ error: "You cannot remove your own account" }, { status: 400 });
  }

  const guard = await ownerProtected(db!, id, session!.user.role);
  if (guard.notFound) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (guard.forbidden) return NextResponse.json({ error: guard.message }, { status: 403 });

  const listingCount = await db!.listing.count({ where: { createdById: id } });
  if (listingCount > 0) {
    // Never delete historical listing ownership - deactivate instead of removing.
    const user = await db!.user.update({
      where: { id },
      data: { status: "INACTIVE" },
      select: { id: true, name: true, email: true, whatsapp: true, avatarUrl: true, role: true, status: true, createdAt: true },
    });
    await setIdentityDisabled(id, true);
    return NextResponse.json({
      user,
      note: "User has existing listings and was deactivated instead of removed, to preserve listing history.",
    });
  }

  await db!.user.delete({ where: { id } });
  await deleteIdentity(id);
  forgetLiveUsers();
  return NextResponse.json({ removed: true });
}
