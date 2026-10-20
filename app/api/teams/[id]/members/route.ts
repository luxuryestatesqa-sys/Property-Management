import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody, requirePermission } from "@/lib/api-helpers";
import { forgetLiveUsers } from "@/lib/liveUser";
import { logActivity } from "@/lib/activity";

// Add people to a team. Someone is in one team at a time, so adding them here moves them out of their old one.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, error } = await requirePermission("teams.manage");
  if (error) return error;
  const { id } = await params;
  const { value, error: bodyError } = await parseJsonBody<{ userIds?: unknown }>(req);
  if (bodyError) return bodyError;
  const userIds = Array.isArray(value?.userIds) ? [...new Set(value.userIds.filter((x): x is string => typeof x === "string" && x.length > 0))] : [];
  if (userIds.length === 0) return NextResponse.json({ error: "Choose at least one person" }, { status: 400 });
  if (userIds.length > 200) return NextResponse.json({ error: "Too many people at once" }, { status: 400 });

  const team = await db!.team.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  const people = await db!.user.findMany({ where: { id: { in: userIds }, status: "ACTIVE", role: { in: ["AGENT", "MANAGER"] } }, select: { id: true, name: true } });
  if (people.length !== userIds.length) return NextResponse.json({ error: "Only active agents and managers can be put in a team" }, { status: 400 });

  await db!.user.updateMany({ where: { id: { in: userIds } }, data: { teamId: id } });
  forgetLiveUsers();
  void logActivity(orgId!, { type: "team_changed", agentId: session!.user.id, newValue: `added ${people.map((p) => p.name).join(", ")}`, note: team.name });
  return NextResponse.json({ added: people.length });
}

// Take one person out of the team (?userId=). Their leads and listings stay with them.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, error } = await requirePermission("teams.manage");
  if (error) return error;
  const { id } = await params;
  const userId = req.nextUrl.searchParams.get("userId") ?? "";
  const team = await db!.team.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  const person = await db!.user.findFirst({ where: { id: userId, teamId: id }, select: { id: true, name: true } });
  if (!person) return NextResponse.json({ error: "That person is not in this team" }, { status: 404 });

  await db!.user.update({ where: { id: userId }, data: { teamId: null } });
  forgetLiveUsers();
  void logActivity(orgId!, { type: "team_changed", agentId: session!.user.id, newValue: `removed ${person.name}`, note: team.name });
  return NextResponse.json({ removed: true });
}
