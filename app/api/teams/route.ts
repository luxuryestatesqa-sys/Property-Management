import { grantTeamManagerPermissions } from "@/lib/teamAccess";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { parseJsonBody, requirePermission } from "@/lib/api-helpers";
import { teamBodySchema } from "@/lib/teams";
import { avatarLink } from "@/lib/avatar";
import { forgetLiveUsers } from "@/lib/liveUser";
import { logActivity } from "@/lib/activity";

const TEAM_SELECT = {
  id: true,
  name: true,
  manager: { select: { id: true, name: true } },
  members: { select: { id: true, name: true, role: true, avatarUrl: true, status: true }, orderBy: { name: "asc" as const } },
};

export async function GET() {
  const { db, error } = await requirePermission("teams.manage");
  if (error) return error;
  const teams = await db!.team.findMany({ orderBy: { name: "asc" }, select: TEAM_SELECT });
  return NextResponse.json({ teams: teams.map((t) => ({ ...t, members: t.members.map((m) => avatarLink(m)!) })) });
}

// Create a team, with its manager and its people.
export async function POST(req: NextRequest) {
  const { session, db, orgId, error } = await requirePermission("teams.manage");
  if (error) return error;
  const { value, error: bodyError } = await parseJsonBody(req);
  if (bodyError) return bodyError;
  const parsed = teamBodySchema.safeParse(value);
  if (!parsed.success || !parsed.data.name) return NextResponse.json({ error: parsed.success ? "Give the team a name" : parsed.error.issues[0]?.message ?? "Invalid team" }, { status: 400 });
  const { name, managerId, memberIds } = parsed.data;

  if (managerId) {
    const manager = await db!.user.findFirst({ where: { id: managerId, role: "MANAGER", status: "ACTIVE" }, select: { id: true } });
    if (!manager) return NextResponse.json({ error: "The team manager must be an active Manager" }, { status: 400 });
  }
  const members = memberIds?.length ? await db!.user.findMany({ where: { id: { in: memberIds }, role: { in: ["AGENT", "MANAGER"] } }, select: { id: true } }) : [];
  if (members.length !== (memberIds ? new Set(memberIds).size : 0)) return NextResponse.json({ error: "Only agents and managers can be put in a team" }, { status: 400 });

  try {
    const team = await db!.team.create({ data: { organizationId: orgId!, name, managerId: managerId ?? null }, select: { id: true } });
    if (members.length) await db!.user.updateMany({ where: { id: { in: members.map((m) => m.id) } }, data: { teamId: team.id } });
    const granted = managerId ? await grantTeamManagerPermissions(managerId) : [];
    forgetLiveUsers();
    void logActivity(orgId!, { type: "team_changed", agentId: session!.user.id, newValue: "created", note: name });
    const created = await db!.team.findUnique({ where: { id: team.id }, select: TEAM_SELECT });
    return NextResponse.json({ team: created, grantedToManager: granted }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return NextResponse.json({ error: "There is already a team with that name" }, { status: 409 });
    throw e;
  }
}
