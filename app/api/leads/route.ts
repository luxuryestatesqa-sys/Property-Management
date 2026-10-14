import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { isManagerRole } from "@/lib/roles";
import { ensureStages, themedStages } from "@/lib/leads/stages";
import { createLeads, IntakeError } from "@/lib/leads/intake";
import { normalizePhone, resolveOrigin } from "@/lib/leads/csv";
import type { Prisma } from "@prisma/client";
import { agentCount } from "@/lib/leads/counts";
import { avatarLink } from "@/lib/avatar";
import { qatarEndOfDay } from "@/lib/qatarTime";

const MAX_LEADS = 300;

// Pages: ?limit=30 returns that many leads plus `nextCursor` (a lead id); send it back as ?cursor=<id>
// for the next page. ?sort=oldest reverses the order. Without ?limit the latest 300 come in one go.
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
  const limit = Math.min(MAX_LEADS, Math.max(1, Number(sp.get("limit")) || MAX_LEADS));
  const cursorId = sp.get("cursor") || null;
  const dir = sp.get("sort") === "oldest" ? "asc" : "desc";

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
  // Follow-up tabs: leads with an open follow-up that is overdue, or due later today (Qatar time).
  const now = new Date();
  const dueWhere = (kind: string): Prisma.LeadWhereInput => ({ tasks: { some: { doneAt: null, dueAt: kind === "overdue" ? { lt: now } : { gte: now, lte: qatarEndOfDay() } } } });
  const followup = sp.get("followup");
  if (followup === "today" || followup === "overdue") Object.assign(where, dueWhere(followup));
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

  const [rows, total] = await Promise.all([
    db!.lead.findMany({
      where,
      orderBy: [{ receivedAt: dir }, { id: dir }],
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: {
        assignedTo: { select: { id: true, name: true, avatarUrl: true } },
        listing: { select: { id: true, buildingName: true, area: true, community: true } },
        groupLinks: { select: { group: { select: { id: true, name: true, color: true } } } },
        tasks: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 1, select: { dueAt: true } },
      },
    }),
    db!.lead.count({ where }),
  ]).catch((e: unknown) => {
    // A cursor that points at a lead that has since been deleted just means "no more".
    if (cursorId) return [[], 0] as const;
    throw e;
  });
  const hasMore = rows.length > limit;
  const leads = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? leads[leads.length - 1].id : null;

  // The one grid every count on screen is derived from (lib/leads/counts.ts): leads grouped by
  // (agent, stage) under the search / channel / group filters, ignoring the agent and stage filters
  // themselves so each dropdown can show what each choice would give.
  const gridWhere: Prisma.LeadWhereInput = { ...where };
  delete gridWhere.assignedToId;
  delete gridWhere.stageId;
  delete gridWhere.tasks; // the follow-up tabs do not change the overall numbers
  if (!manager) gridWhere.assignedToId = me;
  const grouped = await db!.lead.groupBy({ by: ["assignedToId", "stageId"], where: gridWhere, _count: { _all: true } });
  const countGrid = grouped.map((g) => ({ assignedToId: g.assignedToId, stageId: g.stageId, count: g._count._all }));
  let agents: { id: string; name: string; avatarUrl: string | null }[] = [];
  let agentCounts: { assignedToId: string | null; count: number }[] = [];
  if (manager) {
    agents = (await db!.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, avatarUrl: true }, orderBy: { name: "asc" } })).map((a) => avatarLink(a)!);
    agentCounts = [...new Set(countGrid.map((c) => c.assignedToId))].map((id) => ({ assignedToId: id, count: agentCount(countGrid, id) }));
  }

  // Leads that share a phone number or email with another lead the person may see: the "Duplicate" badge.
  const phones = [...new Set(leads.flatMap((l) => (l.phone ? [l.phone] : [])))];
  const emails = [...new Set(leads.flatMap((l) => (l.email ? [l.email.toLowerCase()] : [])))];
  const scope: Prisma.LeadWhereInput = manager ? {} : { assignedToId: me };
  const [phoneGroups, emailGroups] = await Promise.all([
    phones.length ? db!.lead.groupBy({ by: ["phone"], where: { ...scope, phone: { in: phones } }, _count: { _all: true } }) : [],
    emails.length ? db!.lead.groupBy({ by: ["email"], where: { ...scope, email: { in: emails, mode: "insensitive" } }, _count: { _all: true } }) : [],
  ]);
  const phoneCount = new Map(phoneGroups.map((g) => [g.phone, g._count._all]));
  const emailCount = new Map(emailGroups.map((g) => [(g.email ?? "").toLowerCase(), g._count._all]));
  const dupOf = (l: { phone: string | null; email: string | null }) => Math.max((l.phone ? phoneCount.get(l.phone) ?? 1 : 1) - 1, (l.email ? emailCount.get(l.email.toLowerCase()) ?? 1 : 1) - 1);

  // The numbers on the follow-up tabs: same visibility and filters, whichever tab is open.
  const tabBase: Prisma.LeadWhereInput = { ...where };
  delete tabBase.tasks;
  const [dueToday, overdue] = await Promise.all([db!.lead.count({ where: { ...tabBase, ...dueWhere("today") } }), db!.lead.count({ where: { ...tabBase, ...dueWhere("overdue") } })]);

  const newStageId = stages.find((s) => s.kind === "OPEN")?.id;
  const newCount = await db!.lead.count({ where: { ...(manager ? {} : { assignedToId: me }), stageId: newStageId } });

  return NextResponse.json({
    leads: leads.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      channel: l.channel,
      sourceLabel: l.sourceLabel,
      duplicates: dupOf(l),
      source: l.source,
      pfStatus: l.pfStatus,
      region: l.region,
      listing: l.listing ? { id: l.listing.id, buildingName: l.listing.buildingName } : null,
      listingReference: l.listingReference,
      stageId: l.stageId,
      assignedTo: avatarLink(l.assignedTo),
      receivedAt: l.receivedAt,
      firstContactedAt: l.firstContactedAt,
      callTalkTime: l.callTalkTime,
      hasRecording: Boolean(l.callRecordUrl),
      tags: l.tags,
      entityType: l.entityType,
      groups: l.groupLinks.map((g) => g.group),
      nextFollowUp: l.tasks[0]?.dueAt ?? null,
    })),
    total,
    nextCursor,
    stages: themedStages(stages).map((s) => ({ id: s.id, name: s.name, kind: s.kind, color: s.color, position: s.position })),
    agents,
    agentCounts,
    countGrid,
    followups: { today: dueToday, overdue },
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
  const origin = resolveOrigin(body?.channel);
  const channel = origin.channel;

  try {
    const me = await db!.user.findFirst({ where: { id: session!.user.id }, select: { name: true } });
    const r = await createLeads(
      orgId!,
      [{ name: body?.name, phone: body?.phone, email: body?.email, region: body?.region, notes: body?.notes, channel, sourceLabel: origin.sourceLabel ?? "Manual" }],
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
