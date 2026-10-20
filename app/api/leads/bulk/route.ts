import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { openLeadCounts, pickLeastLoaded } from "@/lib/leads/rules";
import { resolveOrigin } from "@/lib/leads/csv";
import { logActivity } from "@/lib/activity";

const MAX_LEADS = 500;

interface Body {
  action?: "assign" | "stage" | "group-add" | "group-remove" | "delete" | "source";
  origin?: string; // source: a key from LEAD_ORIGINS
  leadIds?: string[];
  agentId?: string | null; // assign: one agent, or null/"" for Unassigned
  agentIds?: string[]; // assign with roundRobin: share the leads across these agents
  roundRobin?: boolean;
  stageId?: string;
  groupId?: string;
}

// One endpoint for everything the "N selected" bar can do. Managers act on any lead in the
// agency; an agent only on their own, and only to change stage or groups. Deleting is for
// admins and owners.
export async function POST(req: NextRequest) {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;
  const { value: body, error: bodyError } = await parseJsonBody<Body>(req);
  if (bodyError) return bodyError;

  const me = session!.user.id;
  const manager = can(session!.user, "leads.viewAll");
  const action = body?.action;
  const ids = Array.isArray(body?.leadIds) ? [...new Set(body!.leadIds.filter((x) => typeof x === "string"))].slice(0, MAX_LEADS) : [];
  if (!action || ids.length === 0) return NextResponse.json({ error: "Choose some leads first" }, { status: 400 });
  if (((action === "assign" || action === "source") && !can(session!.user, "leads.assign")) || (action === "delete" && !can(session!.user, "leads.delete"))) {
    return NextResponse.json({ error: action === "delete" ? "You don't have permission to delete leads" : "You don't have permission to assign leads" }, { status: 403 });
  }

  const leads = await db!.lead.findMany({ where: { id: { in: ids }, ...(manager ? {} : { assignedToId: me }) }, select: { id: true, assignedToId: true, stageId: true, firstContactedAt: true } });
  if (leads.length === 0) return NextResponse.json({ error: "No matching leads" }, { status: 404 });
  const leadIds = leads.map((l) => l.id);
  const note = (leadId: string, type: string, text: string, data?: object) => ({ organizationId: orgId!, leadId, userId: me, type, text, ...(data ? { data } : {}) });

  if (action === "source") {
    const o = resolveOrigin(body?.origin);
    await db!.lead.updateMany({ where: { id: { in: leadIds } }, data: { channel: o.channel, sourceLabel: o.sourceLabel } });
    return NextResponse.json({ count: leadIds.length });
  }

  if (action === "delete") {
    const gone = await db!.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true, phone: true } });
    await db!.lead.deleteMany({ where: { id: { in: leadIds } } });
    for (const l of gone) await logActivity(orgId!, { type: "lead_deleted", agentId: me, leadId: l.id, note: `${l.name}${l.phone ? ` (${l.phone})` : ""}` });
    return NextResponse.json({ count: leadIds.length });
  }

  if (action === "assign") {
    let targets: { id: string; name: string }[] = [];
    if (body?.roundRobin) {
      const want = Array.isArray(body.agentIds) ? body.agentIds : [];
      targets = await db!.user.findMany({ where: { id: { in: want }, status: "ACTIVE" }, select: { id: true, name: true } });
      if (targets.length === 0) return NextResponse.json({ error: "Choose at least one agent" }, { status: 400 });
    } else if (body?.agentId) {
      const agent = await db!.user.findFirst({ where: { id: body.agentId, status: "ACTIVE" }, select: { id: true, name: true } });
      if (!agent) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
      targets = [agent];
    }

    // Work out who each lead goes to (null = back to Unassigned).
    const plan = new Map<string, string | null>();
    if (targets.length <= 1) {
      for (const l of leads) plan.set(l.id, targets[0]?.id ?? null);
    } else {
      const ids2 = targets.map((t) => t.id);
      const open = await openLeadCounts(orgId!, ids2);
      for (const l of leads) {
        const next = pickLeastLoaded(ids2, open, {});
        plan.set(l.id, next);
        open.set(next, (open.get(next) ?? 0) + 1);
      }
    }
    const nameOf = new Map(targets.map((t) => [t.id, t.name]));
    const changed = leads.filter((l) => plan.get(l.id) !== l.assignedToId);
    for (const agentId of new Set(changed.map((l) => plan.get(l.id) ?? null))) {
      await db!.lead.updateMany({ where: { id: { in: changed.filter((l) => (plan.get(l.id) ?? null) === agentId).map((l) => l.id) } }, data: { assignedToId: agentId } });
    }
    await db!.leadActivity.createMany({
      data: changed.map((l) => {
        const to = plan.get(l.id) ?? null;
        return note(l.id, "ASSIGNED", to ? `Assigned to ${nameOf.get(to)}${body?.roundRobin && targets.length > 1 ? " (round robin)" : ""}` : "Moved back to Unassigned", { from: l.assignedToId, to });
      }),
    });
    return NextResponse.json({ count: changed.length });
  }

  if (action === "stage") {
    const stage = body?.stageId ? await db!.leadStage.findFirst({ where: { id: body.stageId } }) : null;
    if (!stage) return NextResponse.json({ error: "Unknown stage" }, { status: 404 });
    const first = await db!.leadStage.findFirst({ orderBy: { position: "asc" } });
    const moving = leads.filter((l) => l.stageId !== stage.id);
    if (moving.length === 0) return NextResponse.json({ count: 0 });
    const stages = await db!.leadStage.findMany({ select: { id: true, name: true } });
    const nameOf = new Map(stages.map((s) => [s.id, s.name]));
    await db!.lead.updateMany({ where: { id: { in: moving.map((l) => l.id) } }, data: { stageId: stage.id } });
    // Moving a lead out of the starting stage counts as the first response.
    const firstResponse = moving.filter((l) => !l.firstContactedAt && l.stageId === first?.id).map((l) => l.id);
    if (firstResponse.length) await db!.lead.updateMany({ where: { id: { in: firstResponse } }, data: { firstContactedAt: new Date() } });
    await db!.leadActivity.createMany({ data: moving.map((l) => note(l.id, "STAGE_CHANGED", `Stage: ${nameOf.get(l.stageId) ?? "?"} → ${stage.name}`, { from: l.stageId, to: stage.id })) });
    return NextResponse.json({ count: moving.length });
  }

  if (action === "group-add" || action === "group-remove") {
    const group = body?.groupId ? await db!.leadGroup.findFirst({ where: { id: body.groupId } }) : null;
    if (!group) return NextResponse.json({ error: "Unknown group" }, { status: 404 });
    const linked = new Set((await db!.leadGroupLink.findMany({ where: { groupId: group.id, leadId: { in: leadIds } }, select: { leadId: true } })).map((l) => l.leadId));
    const todo = leadIds.filter((id) => (action === "group-add" ? !linked.has(id) : linked.has(id)));
    if (todo.length === 0) return NextResponse.json({ count: 0 });
    if (action === "group-add") await db!.leadGroupLink.createMany({ data: todo.map((leadId) => ({ organizationId: orgId!, leadId, groupId: group.id })), skipDuplicates: true });
    else await db!.leadGroupLink.deleteMany({ where: { groupId: group.id, leadId: { in: todo } } });
    await db!.leadActivity.createMany({ data: todo.map((id) => note(id, "GROUP_CHANGED", action === "group-add" ? `Added to ${group.name}` : `Removed from ${group.name}`)) });
    return NextResponse.json({ count: todo.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
