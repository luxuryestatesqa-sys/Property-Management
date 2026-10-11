import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { isManagerRole } from "@/lib/roles";

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
  if (!isManagerRole(session!.user.role) && lead.assignedToId !== session!.user.id) return NextResponse.json({ error: "Not your lead" }, { status: 403 });

  const task = await db!.leadTask.create({
    data: { organizationId: orgId!, leadId: id, assignedToId: lead.assignedToId ?? session!.user.id, text, dueAt, createdById: session!.user.id },
  });
  await db!.leadActivity.create({
    data: {
      organizationId: orgId!,
      leadId: id,
      userId: session!.user.id,
      type: "TASK_CREATED",
      text: `Follow-up set for ${dueAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}: ${text}`,
    },
  });
  return NextResponse.json({ task }, { status: 201 });
}
