import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";

// Add a follow-up reminder to a lead. It belongs to the lead's agent (or, for an
// unassigned lead, to whoever created it) and also goes on the lead's timeline.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const { value: body, error: bodyError } = await parseJsonBody<{ text?: string; dueAt?: string }>(req);
  if (bodyError) return bodyError;

  const text = (body?.text ?? "").trim().slice(0, 300);
  const dueAt = body?.dueAt ? new Date(body.dueAt) : null;
  if (!text) return NextResponse.json({ error: "Say what needs doing" }, { status: 400 });
  if (!dueAt || Number.isNaN(dueAt.getTime())) return NextResponse.json({ error: "Choose when it is due" }, { status: 400 });

  const lead = await db!.lead.findFirst({ where: { id } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!can(session!.user, "leads.viewAll") && lead.assignedToId !== session!.user.id) return NextResponse.json({ error: "Not your lead" }, { status: 403 });

  // The same follow-up arriving again within 2 seconds is a double click, not a second follow-up.
  const repeat = await db!.leadTask.findFirst({ where: { leadId: id, text, dueAt, createdById: session!.user.id, createdAt: { gte: new Date(Date.now() - 2000) } } });
  if (repeat) return NextResponse.json({ task: repeat }, { status: 201 });

  const task = await db!.leadTask.create({
    data: { organizationId: orgId!, leadId: id, assignedToId: lead.assignedToId ?? session!.user.id, text, dueAt, createdById: session!.user.id },
  });
  await db!.leadActivity.create({
    data: {
      organizationId: orgId!,
      leadId: id,
      userId: session!.user.id,
      type: "TASK_CREATED",
      text: `Follow-up set for ${dueAt.toLocaleString("en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}: ${text}`,
    },
  });
  return NextResponse.json({ task }, { status: 201 });
}
