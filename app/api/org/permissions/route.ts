import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseJsonBody, requirePermission, requireSession } from "@/lib/api-helpers";
import { DEFAULT_PERMISSIONS, isSuperAdminRole, normalizePermissions, templateFor } from "@/lib/permissions";
import { forgetLiveUsers } from "@/lib/liveUser";
import { logActivity } from "@/lib/activity";

// The permission templates for Admins, Managers and Agents: what a new person of that role starts with, and what
// anyone without their own saved choices follows. Only the Super Admin (the Owner) can change them; the Super
// Admin always has everything.
async function load(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { rolePermissions: true } });
  const saved = org?.rolePermissions as never;
  return { ADMIN: templateFor("ADMIN", saved), MANAGER: templateFor("MANAGER", saved), AGENT: templateFor("AGENT", saved) };
}

export async function GET() {
  const { orgId, error } = await requirePermission("users.manage");
  if (error) return error;
  return NextResponse.json({ templates: await load(orgId!), defaults: DEFAULT_PERMISSIONS });
}

export async function PUT(req: NextRequest) {
  const { session, orgId, error } = await requireSession();
  if (error) return error;
  if (!isSuperAdminRole(session!.user.role)) return NextResponse.json({ error: "Only the Super Admin can change the role templates" }, { status: 403 });
  const { value, error: bodyError } = await parseJsonBody<{ ADMIN?: unknown; MANAGER?: unknown; AGENT?: unknown }>(req);
  if (bodyError) return bodyError;
  if (!Array.isArray(value?.ADMIN) || !Array.isArray(value?.MANAGER) || !Array.isArray(value?.AGENT)) return NextResponse.json({ error: "Send the Admin, Manager and Agent lists" }, { status: 400 });
  const templates = { ADMIN: normalizePermissions(value.ADMIN), MANAGER: normalizePermissions(value.MANAGER), AGENT: normalizePermissions(value.AGENT) };
  await prisma.organization.update({ where: { id: orgId! }, data: { rolePermissions: templates } });
  forgetLiveUsers();
  void logActivity(orgId!, { type: "permissions_changed", agentId: session!.user.id, newValue: "role templates", note: "Admin, Manager and Agent templates" });
  return NextResponse.json({ templates });
}
