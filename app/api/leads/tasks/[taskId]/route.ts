import { reachOf, reaches, leadsWhere } from "@/lib/scope";
import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";

async function loadOwnTask(taskId: string) {
  const { session, db, orgId, scope: teamScope, error } = await requireSession();
  if (error) return { error } as const;
  const task = await db!.leadTask.findFirst({ where: { id: taskId } });
  if (!task) return { error: NextResponse.json({ error: "Follow-up not found" }, { status: 404 }) } as const;
  if (!reaches(reachOf(session!.user, "leads.viewAll", teamScope), task.assignedToId)) {
    return { error: NextResponse.json({ error: "Not your follow-up" }, { status: 403 }) } as const;
  }
  return { session, db: db!, orgId: orgId!, task } as const;
}

// { done: true | false } - tick a follow-up off (or reopen it).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const ctx = await loadOwnTask(taskId);
  if ("error" in ctx) return ctx.error;
  const { value: body, error: bodyError } = await parseJsonBody<{ done?: boolean }>(req);
  if (bodyError) return bodyError;
  if (typeof body?.done !== "boolean") return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  // Ticking off a follow-up that is already done (or reopening one that is open) changes nothing and logs nothing.
  if (body.done === Boolean(ctx.task.doneAt)) return NextResponse.json({ ok: true });
  await ctx.db.leadTask.update({ where: { id: taskId }, data: { doneAt: body.done ? new Date() : null } });
  if (body.done) {
    await ctx.db.leadActivity.create({
      data: { organizationId: ctx.orgId, leadId: ctx.task.leadId, userId: ctx.session!.user.id, type: "TASK_DONE", text: `Follow-up done: ${ctx.task.text}` },
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const ctx = await loadOwnTask(taskId);
  if ("error" in ctx) return ctx.error;
  await ctx.db.leadTask.delete({ where: { id: taskId } });
  return NextResponse.json({ ok: true });
}
