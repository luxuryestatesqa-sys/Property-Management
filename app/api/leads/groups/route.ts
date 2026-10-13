import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { isManagerRole } from "@/lib/roles";

// Group chip colours come from the theme: cobalt, deep navy, muted status colours and greys.
const COLORS = ["#2b4fc0", "#0d1f5c", "#3e8e6a", "#b7862b", "#b5474b", "#5a6690"];

export async function GET() {
  const { session, db, error } = await requireSession();
  if (error) return error;
  const groups = await db!.leadGroup.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { links: true } } } });
  // Agents only see the groups' names; counts would reveal other agents' leads.
  const manager = isManagerRole(session!.user.role);
  return NextResponse.json({ groups: groups.map((g) => ({ id: g.id, name: g.name, color: g.color, count: manager ? g._count.links : null })) });
}

// Managers and above can create groups.
export async function POST(req: NextRequest) {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;
  if (!isManagerRole(session!.user.role)) return NextResponse.json({ error: "Only managers can create groups" }, { status: 403 });
  const { value: body, error: bodyError } = await parseJsonBody<{ name?: string }>(req);
  if (bodyError) return bodyError;
  const name = (body?.name ?? "").trim().slice(0, 40);
  if (!name) return NextResponse.json({ error: "Give the group a name" }, { status: 400 });

  const existing = await db!.leadGroup.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) return NextResponse.json({ group: { id: existing.id, name: existing.name, color: existing.color } });
  const count = await db!.leadGroup.count();
  try {
    const group = await db!.leadGroup.create({ data: { organizationId: orgId!, name, color: COLORS[count % COLORS.length] } });
    return NextResponse.json({ group: { id: group.id, name: group.name, color: group.color } }, { status: 201 });
  } catch {
    // Two requests created the same name at once: hand back the one that won.
    const won = await db!.leadGroup.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    if (won) return NextResponse.json({ group: { id: won.id, name: won.name, color: won.color } });
    throw new Error("Couldn't create the group");
  }
}
