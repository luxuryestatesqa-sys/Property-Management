import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseJsonBody, requireAdmin, requirePermission } from "@/lib/api-helpers";
import { DEFAULT_PERMISSIONS, normalizePermissions, templateFor } from "@/lib/permissions";
import { forgetLiveUsers } from "@/lib/liveUser";
import { logActivity } from "@/lib/activity";

// The permission templates for Managers and Agents: what a new person of that role starts with, and what
// anyone without their own saved choices follows. Super Admins always have everything.
async function load(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { rolePermissions: true } });
  const saved = org?.rolePermissions as never;
  return { MANAGER: templateFor("MANAGER", saved), AGENT: templateFor("AGENT", saved) };
}

export async function GET() {
  const { orgId, error } = await requirePermission("users.manage");
  if (error) return error;
  return NextResponse.json({ templates: await load(orgId!), defaults: DEFAULT_PERMISSIONS });
}

export async function PUT(req: NextRequest) {
  const { session, orgId, error } = await requireAdmin();
  if (error) return error;
  const { value, error: bodyError } = await parseJsonBody<{ MANAGER?: unknown; AGENT?: unknown }>(req);
  if (bodyError) return bodyError;
  if (!Array.isArray(value?.MANAGER) || !Array.isArray(value?.AGENT)) return NextResponse.json({ error: "Send the Manager and Agent lists" }, { status: 400 });
  const templates = { MANAGER: normalizePermissions(value.MANAGER), AGENT: normalizePermissions(value.AGENT) };
  await prisma.organization.update({ where: { id: orgId! }, data: { rolePermissions: templates } });
  forgetLiveUsers();
  void logActivity(orgId!, { type: "permissions_changed", agentId: session!.user.id, newValue: "role templates", note: "Manager and Agent templates" });
  return NextResponse.json({ templates });
}
