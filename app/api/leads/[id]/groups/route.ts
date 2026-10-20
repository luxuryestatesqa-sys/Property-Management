import { reachOf, reaches, leadsWhere } from "@/lib/scope";
import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";

// { groupIds: [...] } - set exactly which groups this lead is in.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, scope: teamScope, error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const { value: body, error: bodyError } = await parseJsonBody<{ groupIds?: string[] }>(req);
  if (bodyError) return bodyError;
  if (!Array.isArray(body?.groupIds)) return NextResponse.json({ error: "groupIds is required" }, { status: 400 });

  const lead = await db!.lead.findFirst({ where: { id }, include: { groupLinks: { include: { group: true } } } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!reaches(reachOf(session!.user, "leads.viewAll", teamScope), lead.assignedToId)) return NextResponse.json({ error: "Not your lead" }, { status: 403 });

  const wanted = await db!.leadGroup.findMany({ where: { id: { in: body.groupIds } } });
  const before = new Set(lead.groupLinks.map((l) => l.groupId));
  const after = new Set(wanted.map((g) => g.id));
  const added = wanted.filter((g) => !before.has(g.id));
  const removed = lead.groupLinks.filter((l) => !after.has(l.groupId));
  if (added.length === 0 && removed.length === 0) return NextResponse.json({ ok: true });

  if (removed.length) await db!.leadGroupLink.deleteMany({ where: { leadId: id, groupId: { in: removed.map((r) => r.groupId) } } });
  // skipDuplicates: two quick clicks must not crash on the (lead, group) unique key
  if (added.length) await db!.leadGroupLink.createMany({ data: added.map((g) => ({ organizationId: orgId!, leadId: id, groupId: g.id })), skipDuplicates: true });

  const parts = [added.length ? `Added to ${added.map((g) => g.name).join(", ")}` : "", removed.length ? `Removed from ${removed.map((r) => r.group.name).join(", ")}` : ""].filter(Boolean);
  await db!.leadActivity.create({ data: { organizationId: orgId!, leadId: id, userId: session!.user.id, type: "GROUP_CHANGED", text: parts.join(". ") } });
  return NextResponse.json({ ok: true });
}
