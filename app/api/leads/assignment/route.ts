import { can } from "@/lib/permissions";
import { qatarStartOfDay } from "@/lib/qatarTime";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { applyRulesToUnassigned } from "@/lib/leads/rules";

function forbid() {
  return NextResponse.json({ error: "Only managers can assign leads" }, { status: 403 });
}

// Everything the Leads Assignment page shows: the Unassigned inbox, each agent's
// workload, the routing rules, and the latest assignment changes.
export async function GET() {
  const { session, db, error } = await requireSession();
  if (error) return error;
  if (!can(session!.user, "leads.assign")) return forbid();

  const startOfToday = qatarStartOfDay();
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const [unassigned, agents, rules, audit, openByAgent, openSharedByAgent, totalByAgent, doneByAgent, responded, todayByAgent, weekByAgent, shareable] = await Promise.all([
    db!.lead.findMany({
      where: { assignedToId: null },
      orderBy: { receivedAt: "desc" },
      take: 200,
      select: { id: true, name: true, phone: true, channel: true, region: true, listingReference: true, receivedAt: true, firstContactedAt: true, listing: { select: { buildingName: true } } },
    }),
    db!.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, avatarUrl: true, role: true }, orderBy: { name: "asc" } }),
    db!.assignmentRule.findMany({ orderBy: { position: "asc" } }),
    db!.leadActivity.findMany({
      where: { type: "ASSIGNED" },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, text: true, createdAt: true, user: { select: { name: true } }, lead: { select: { id: true, name: true } } },
    }),
    db!.lead.groupBy({ by: ["assignedToId"], where: { assignedToId: { not: null }, stage: { kind: "OPEN" } }, _count: { _all: true } }),
    // open leads from the sources the rotation shares out (not Property Finder): what Round robin compares
    db!.lead.groupBy({ by: ["assignedToId"], where: { assignedToId: { not: null }, source: { not: "PROPERTY_FINDER" }, stage: { kind: "OPEN" } }, _count: { _all: true } }),
    db!.lead.groupBy({ by: ["assignedToId"], where: { assignedToId: { not: null } }, _count: { _all: true } }),
    db!.lead.groupBy({ by: ["assignedToId"], where: { assignedToId: { not: null }, stage: { kind: "WON" } }, _count: { _all: true } }),
    db!.lead.findMany({ where: { assignedToId: { not: null }, firstContactedAt: { not: null } }, orderBy: { receivedAt: "desc" }, take: 300, select: { assignedToId: true, receivedAt: true, firstContactedAt: true } }),
    db!.lead.groupBy({ by: ["assignedToId"], where: { assignedToId: { not: null }, receivedAt: { gte: startOfToday } }, _count: { _all: true } }),
    db!.lead.groupBy({ by: ["assignedToId"], where: { assignedToId: { not: null }, receivedAt: { gte: weekAgo } }, _count: { _all: true } }),
    db!.lead.count({ where: { assignedToId: null, source: { not: "PROPERTY_FINDER" } } }),
  ]);

  const count = (rows: { assignedToId: string | null; _count: { _all: number } }[], id: string) => rows.find((r) => r.assignedToId === id)?._count._all ?? 0;
  const workload = agents.map((a) => {
    const times = responded.filter((r) => r.assignedToId === a.id).map((r) => r.firstContactedAt!.getTime() - r.receivedAt.getTime()).filter((ms) => ms >= 0);
    return {
      ...a,
      open: count(openByAgent, a.id),
      openShared: count(openSharedByAgent, a.id),
      total: count(totalByAgent, a.id),
      won: count(doneByAgent, a.id),
      today: count(todayByAgent, a.id),
      week: count(weekByAgent, a.id),
      avgResponseMinutes: times.length ? Math.round(times.reduce((x, y) => x + y, 0) / times.length / 60000) : null,
    };
  });

  return NextResponse.json({
    unassigned: unassigned.map((l) => ({ ...l, listing: l.listing?.buildingName ?? null })),
    workload,
    shareable, // waiting leads that rules may hand out (not Property Finder)
    rules: rules.map((r) => ({ id: r.id, name: r.name, kind: r.kind, matchText: r.matchText, agentIds: r.agentIds, shares: r.shares ?? {}, active: r.active, position: r.position })),
    audit: audit.map((a) => ({ id: a.id, text: a.text, createdAt: a.createdAt, by: a.user?.name ?? null, lead: a.lead })),
  });
}

// { action: "assign", leadIds: [...], agentId }  - hand leads to one agent
// { action: "apply-rules" }                      - run the rules over the Unassigned inbox
export async function POST(req: NextRequest) {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;
  if (!can(session!.user, "leads.assign")) return forbid();
  const { value: body, error: bodyError } = await parseJsonBody<{ action?: string; leadIds?: string[]; agentId?: string }>(req);
  if (bodyError) return bodyError;

  if (body?.action === "apply-rules") {
    return NextResponse.json(await applyRulesToUnassigned(orgId!, session!.user.id));
  }

  if (body?.action === "assign") {
    const ids = Array.isArray(body.leadIds) ? body.leadIds.filter((x) => typeof x === "string").slice(0, 200) : [];
    if (ids.length === 0 || !body.agentId) return NextResponse.json({ error: "Choose leads and an agent" }, { status: 400 });
    const agent = await db!.user.findFirst({ where: { id: body.agentId, status: "ACTIVE" }, select: { id: true, name: true } });
    if (!agent) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
    const leads = await db!.lead.findMany({ where: { id: { in: ids } }, select: { id: true, assignedToId: true } });
    for (const l of leads) {
      if (l.assignedToId === agent.id) continue;
      await db!.lead.update({ where: { id: l.id }, data: { assignedToId: agent.id } });
      await db!.leadActivity.create({
        data: { organizationId: orgId!, leadId: l.id, userId: session!.user.id, type: "ASSIGNED", text: `Assigned to ${agent.name}`, data: { from: l.assignedToId, to: agent.id } },
      });
    }
    return NextResponse.json({ assigned: leads.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
