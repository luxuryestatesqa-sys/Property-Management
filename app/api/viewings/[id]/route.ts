import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { isManagerRole } from "@/lib/roles";
import { listingCode } from "@/lib/format";

async function find(db: NonNullable<Awaited<ReturnType<typeof requireSession>>["db"]>, id: string, me: string, manager: boolean) {
  return db.viewing.findFirst({ where: { id, ...(manager ? {} : { OR: [{ agentId: me }, { lead: { assignedToId: me } }] }) }, select: { id: true, leadId: true, status: true, listingId: true, scheduledAt: true, listing: { select: { buildingName: true } } } });
}

// Mark a viewing done or cancelled.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const { value: body, error: bodyError } = await parseJsonBody<{ status?: string }>(req);
  if (bodyError) return bodyError;
  if (body?.status !== "DONE" && body?.status !== "CANCELLED" && body?.status !== "SCHEDULED") return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  const v = await find(db!, id, session!.user.id, isManagerRole(session!.user.role));
  if (!v) return NextResponse.json({ error: "Viewing not found" }, { status: 404 });
  if (v.status === body.status) return NextResponse.json({ ok: true }); // already in that state: nothing to log
  if (body.status === "DONE" && v.scheduledAt.getTime() > Date.now()) return NextResponse.json({ error: "This viewing has not happened yet. Cancel or reschedule it instead." }, { status: 400 });
  await db!.viewing.update({ where: { id }, data: { status: body.status } });
  const place = v.listingId ? ` · ${listingCode(v.listingId)} ${v.listing?.buildingName ?? ""}`.trimEnd() : "";
  await db!.leadActivity.create({
    data: {
      organizationId: orgId!,
      leadId: v.leadId,
      userId: session!.user.id,
      type: body.status === "DONE" ? "VIEWING_DONE" : body.status === "CANCELLED" ? "VIEWING_CANCELLED" : "NOTE",
      text: (body.status === "DONE" ? "Viewing completed" : body.status === "CANCELLED" ? "Viewing cancelled" : "Viewing rescheduled back to scheduled") + place,
      data: { viewingId: id, listingId: v.listingId },
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const v = await find(db!, id, session!.user.id, isManagerRole(session!.user.role));
  if (!v) return NextResponse.json({ error: "Viewing not found" }, { status: 404 });
  await db!.viewing.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
