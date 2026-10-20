import { grantTeamManagerPermissions } from "@/lib/teamAccess";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { parseJsonBody, requirePermission, requireSession } from "@/lib/api-helpers";
import { can } from "@/lib/permissions";
import { loadTeamDetail } from "@/lib/teamStatsLoader";
import { teamBodySchema } from "@/lib/teams";
import { forgetLiveUsers } from "@/lib/liveUser";
import { logActivity } from "@/lib/activity";

const TEAM_SELECT = {
  id: true,
  name: true,
  manager: { select: { id: true, name: true } },
  members: { select: { id: true, name: true, role: true, avatarUrl: true, status: true }, orderBy: { name: "asc" as const } },
};

type Db = NonNullable<Awaited<ReturnType<typeof requirePermission>>["db"]>;

// A Manager who is in charge of no team is not limited to a team, so taking a Manager's last team away would
// give them the whole agency's view. That is allowed, but only after the caller has been told (confirm: true).
async function wouldGoAgencyWide(db: Db, managerId: string | null, exceptTeamId: string) {
  if (!managerId) return null;
  const others = await db.team.count({ where: { managerId, NOT: { id: exceptTeamId } } });
  if (others > 0) return null;
  return db.user.findFirst({ where: { id: managerId }, select: { name: true } });
}

const confirmNeeded = (name: string) =>
  NextResponse.json({ error: `${name} is not the manager of any other team, so they would see the whole agency's leads and listings. Confirm to continue.`, needsConfirm: true }, { status: 409 });

// A team's page: its people with their listings and leads, and the totals. Anyone with the Teams permission can open
// any team; a manager can open the team they are in charge of. Everyone else gets "no".
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const canEdit = can(session!.user, "teams.manage");
  if (!canEdit) {
    const mine = await db!.team.findFirst({ where: { id, managerId: session!.user.id }, select: { id: true } });
    if (!mine) return NextResponse.json({ error: "You don't have permission to see this team" }, { status: 403 });
  }
  const detail = await loadTeamDetail(db!, id, canEdit);
  if (!detail) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, error } = await requirePermission("teams.manage");
  if (error) return error;
  const { id } = await params;
  const { value, error: bodyError } = await parseJsonBody(req);
  if (bodyError) return bodyError;
  const parsed = teamBodySchema.safeParse(value);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid team" }, { status: 400 });
  const { name, managerId, memberIds, confirm } = parsed.data;

  const team = await db!.team.findUnique({ where: { id }, select: { id: true, name: true, managerId: true } });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  if (managerId !== undefined && managerId !== team.managerId) {
    if (managerId) {
      const manager = await db!.user.findFirst({ where: { id: managerId, role: "MANAGER", status: "ACTIVE" }, select: { id: true } });
      if (!manager) return NextResponse.json({ error: "The team manager must be an active Manager" }, { status: 400 });
    }
    const leaving = await wouldGoAgencyWide(db!, team.managerId, id);
    if (leaving && !confirm) return confirmNeeded(leaving.name);
  }
  let members: { id: string }[] = [];
  if (memberIds) {
    members = memberIds.length ? await db!.user.findMany({ where: { id: { in: memberIds }, role: { in: ["AGENT", "MANAGER"] } }, select: { id: true } }) : [];
    if (members.length !== new Set(memberIds).size) return NextResponse.json({ error: "Only agents and managers can be put in a team" }, { status: 400 });
  }

  try {
    await db!.team.update({ where: { id }, data: { ...(name ? { name } : {}), ...(managerId !== undefined ? { managerId } : {}) } });
    if (memberIds) {
      await db!.user.updateMany({ where: { teamId: id, id: { notIn: members.map((m) => m.id) } }, data: { teamId: null } });
      if (members.length) await db!.user.updateMany({ where: { id: { in: members.map((m) => m.id) } }, data: { teamId: id } });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return NextResponse.json({ error: "There is already a team with that name" }, { status: 409 });
    throw e;
  }
  const granted = managerId && managerId !== team.managerId ? await grantTeamManagerPermissions(managerId) : [];
  forgetLiveUsers();
  void logActivity(orgId!, { type: "team_changed", agentId: session!.user.id, newValue: "updated", note: name ?? team.name });
  return NextResponse.json({ team: await db!.team.findUnique({ where: { id }, select: TEAM_SELECT }), grantedToManager: granted });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, error } = await requirePermission("teams.manage");
  if (error) return error;
  const { id } = await params;
  const team = await db!.team.findUnique({ where: { id }, select: { id: true, name: true, managerId: true } });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  const { value } = await parseJsonBody<{ confirm?: boolean }>(req).catch(() => ({ value: null }));
  const leaving = await wouldGoAgencyWide(db!, team.managerId, id);
  if (leaving && !value?.confirm) return confirmNeeded(leaving.name);

  await db!.team.delete({ where: { id } });
  forgetLiveUsers();
  void logActivity(orgId!, { type: "team_changed", agentId: session!.user.id, newValue: "deleted", note: team.name });
  return NextResponse.json({ removed: true });
}
