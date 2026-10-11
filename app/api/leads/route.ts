import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { isManagerRole } from "@/lib/roles";
import { ensureStages } from "@/lib/leads/stages";
import type { Prisma } from "@prisma/client";

const MAX_LEADS = 300;

// Leads the signed-in person may see. Agents get only the leads assigned to them;
// managers, admins and owners get the whole agency and can narrow by agent with
// ?assignee=<userId> | unassigned. Everything is already scoped to the agency by `db`.
export async function GET(req: NextRequest) {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;
  const manager = isManagerRole(session!.user.role);
  const me = session!.user.id;
  const sp = req.nextUrl.searchParams;

  const stages = await ensureStages(orgId!);

  const where: Prisma.LeadWhereInput = {};
  if (!manager) {
    where.assignedToId = me;
  } else {
    const assignee = sp.get("assignee");
    if (assignee === "unassigned") where.assignedToId = null;
    else if (assignee && assignee !== "all") where.assignedToId = assignee;
  }
  const stage = sp.get("stage");
  if (stage && stage !== "all") where.stageId = stage;
  const channel = sp.get("channel");
  if (channel && ["WHATSAPP", "CALL", "EMAIL", "OTHER"].includes(channel)) where.channel = channel as Prisma.LeadWhereInput["channel"];
  const q = sp.get("q")?.trim();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { email: { contains: q, mode: "insensitive" } },
      { region: { contains: q, mode: "insensitive" } },
      { listingReference: { contains: q, mode: "insensitive" } },
    ];
  }

  const [leads, total] = await Promise.all([
    db!.lead.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: MAX_LEADS,
      include: {
        assignedTo: { select: { id: true, name: true, avatarUrl: true } },
        listing: { select: { id: true, buildingName: true, area: true, community: true } },
      },
    }),
    db!.lead.count({ where }),
  ]);

  // Per-agent / unassigned counts for the tabs (managers only), ignoring the agent filter itself.
  let agentCounts: { assignedToId: string | null; count: number }[] = [];
  let agents: { id: string; name: string; avatarUrl: string | null }[] = [];
  if (manager) {
    const base: Prisma.LeadWhereInput = { ...where };
    delete base.assignedToId;
    const grouped = await db!.lead.groupBy({ by: ["assignedToId"], where: base, _count: { _all: true } });
    agentCounts = grouped.map((g) => ({ assignedToId: g.assignedToId, count: g._count._all }));
    agents = await db!.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, avatarUrl: true }, orderBy: { name: "asc" } });
  }

  const newStageId = stages.find((s) => s.kind === "OPEN")?.id;
  const newCount = await db!.lead.count({ where: { ...(manager ? {} : { assignedToId: me }), stageId: newStageId } });

  return NextResponse.json({
    leads: leads.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      channel: l.channel,
      source: l.source,
      pfStatus: l.pfStatus,
      region: l.region,
      listing: l.listing ? { id: l.listing.id, buildingName: l.listing.buildingName } : null,
      listingReference: l.listingReference,
      stageId: l.stageId,
      assignedTo: l.assignedTo,
      receivedAt: l.receivedAt,
      callTalkTime: l.callTalkTime,
      hasRecording: Boolean(l.callRecordUrl),
      tags: l.tags,
      entityType: l.entityType,
    })),
    total,
    stages: stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, color: s.color, position: s.position })),
    agents,
    agentCounts,
    newCount,
    canManage: manager,
  });
}
