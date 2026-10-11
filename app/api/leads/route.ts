import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { isManagerRole } from "@/lib/roles";
import { ensureStages } from "@/lib/leads/stages";
import { createLeads, IntakeError } from "@/lib/leads/intake";
import { normalizePhone } from "@/lib/leads/csv";
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
  if (channel && ["WHATSAPP", "CALL", "EMAIL", "OTHER", "FORM"].includes(channel)) where.channel = channel as Prisma.LeadWhereInput["channel"];
  const group = sp.get("group");
  if (group && group !== "all") where.groupLinks = { some: { groupId: group } };
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
        groupLinks: { select: { group: { select: { id: true, name: true, color: true } } } },
        tasks: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 1, select: { dueAt: true } },
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
      groups: l.groupLinks.map((g) => g.group),
      nextFollowUp: l.tasks[0]?.dueAt ?? null,
    })),
    total,
    stages: stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, color: s.color, position: s.position })),
    agents,
    agentCounts,
    newCount,
    canManage: manager,
  });
}

// Add one lead by hand. Anyone can add a lead: an agent's lead is always theirs; a manager
// chooses the agent, lets the assignment rules decide, or leaves it Unassigned. A phone number
// or email we already have is refused unless `force` is sent ("add anyway").
export async function POST(req: NextRequest) {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;
  const { value: body, error: bodyError } = await parseJsonBody<{ name?: string; phone?: string; email?: string; region?: string; notes?: string; channel?: string; assign?: { mode?: string; agentId?: string }; stageId?: string; force?: boolean }>(req);
  if (bodyError) return bodyError;

  const manager = isManagerRole(session!.user.role);
  const mode = manager && (body?.assign?.mode === "rules" || body?.assign?.mode === "agent" || body?.assign?.mode === "none") ? body.assign.mode : "self";
  if (mode === "agent" && !body?.assign?.agentId) return NextResponse.json({ error: "Choose an agent" }, { status: 400 });
  const channel = body?.channel === "WHATSAPP" || body?.channel === "CALL" || body?.channel === "EMAIL" ? body.channel : "OTHER";

  try {
    const me = await db!.user.findFirst({ where: { id: session!.user.id }, select: { name: true } });
    const r = await createLeads(
      orgId!,
      [{ name: body?.name, phone: body?.phone, email: body?.email, region: body?.region, notes: body?.notes, channel }],
      { source: "MANUAL", actor: { id: session!.user.id, name: me?.name ?? "a team member" }, assign: { mode, agentId: body?.assign?.agentId }, stageId: manager ? body?.stageId : undefined, allowDuplicates: Boolean(body?.force) }
    );
    if (r.invalid.length) return NextResponse.json({ error: r.invalid[0].reason === "No phone number or email" ? "Enter a phone number or an email" : r.invalid[0].reason }, { status: 400 });
    if (r.duplicates.length) {
      const phone = normalizePhone(body?.phone);
      const existing = phone ? await db!.lead.findFirst({ where: { phone: { in: [phone, phone.replace(/^\+/, ""), `+${phone.replace(/^\+/, "")}`] } }, select: { id: true, name: true } }) : null;
      return NextResponse.json({ error: r.duplicates[0].reason, duplicate: true, existing }, { status: 409 });
    }
    return NextResponse.json({ id: r.leadIds[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof IntakeError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
