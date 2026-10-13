import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { isManagerRole, isAdminRole } from "@/lib/roles";
import { visibleListingsWhere } from "@/lib/listingPrivacy";
import { listingCode } from "@/lib/format";
import type { Prisma } from "@prisma/client";

const SELECT = {
  id: true,
  scheduledAt: true,
  notes: true,
  status: true,
  lead: { select: { id: true, name: true, phone: true } },
  listing: { select: { id: true, buildingName: true, community: true, area: true } },
  agent: { select: { id: true, name: true } },
} satisfies Prisma.ViewingSelect;

// ?leadId= | ?listingId= | ?upcoming=1 (from now on, soonest first). Managers see the whole agency's viewings;
// an agent only those of their own leads or those booked for them.
export async function GET(req: NextRequest) {
  const { session, db, error } = await requireSession();
  if (error) return error;
  const sp = req.nextUrl.searchParams;
  const me = session!.user.id;
  const manager = isManagerRole(session!.user.role);
  const where: Prisma.ViewingWhereInput = {};
  if (!manager) where.OR = [{ agentId: me }, { lead: { assignedToId: me } }];
  if (sp.get("leadId")) where.leadId = sp.get("leadId")!;
  if (sp.get("listingId")) where.listingId = Number(sp.get("listingId"));
  if (sp.get("upcoming") === "1") {
    where.scheduledAt = { gte: new Date() };
    where.status = "SCHEDULED";
  }
  const viewings = await db!.viewing.findMany({ where, select: SELECT, orderBy: { scheduledAt: "asc" }, take: 100 });
  return NextResponse.json({ viewings });
}

// Book a viewing: one lead, optionally one property and an agent, at a time. It is written to the lead's
// timeline, and counts as first contact when the lead had not been contacted yet.
export async function POST(req: NextRequest) {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;
  const { value: body, error: bodyError } = await parseJsonBody<{ leadId?: string; listingId?: number | string | null; agentId?: string | null; scheduledAt?: string; notes?: string }>(req);
  if (bodyError) return bodyError;
  const me = session!.user.id;
  const manager = isManagerRole(session!.user.role);

  const lead = body?.leadId ? await db!.lead.findFirst({ where: { id: body.leadId, ...(manager ? {} : { assignedToId: me }) }, select: { id: true, name: true, listingId: true, firstContactedAt: true } }) : null;
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const when = body?.scheduledAt ? new Date(body.scheduledAt) : null;
  if (!when || Number.isNaN(when.getTime())) return NextResponse.json({ error: "Choose a date and time" }, { status: 400 });

  const listingNum = body?.listingId ? Number(String(body.listingId).replace(/\D/g, "")) : lead.listingId;
  const listing = listingNum ? await db!.listing.findFirst({ where: { id: listingNum, ...visibleListingsWhere(me, isAdminRole(session!.user.role)) }, select: { id: true, buildingName: true } }) : null;
  if (listingNum && !listing) return NextResponse.json({ error: "No property found with that ID" }, { status: 404 });

  let agentId: string | null = me;
  if (body?.agentId !== undefined) {
    agentId = body.agentId || null;
    if (agentId) {
      if (!manager && agentId !== me) return NextResponse.json({ error: "Only managers can book a viewing for someone else" }, { status: 403 });
      if (!(await db!.user.findFirst({ where: { id: agentId, status: "ACTIVE" }, select: { id: true } }))) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
    }
  }

  const viewing = await db!.viewing.create({
    data: { organizationId: orgId!, leadId: lead.id, listingId: listing?.id ?? null, agentId, scheduledAt: when, notes: body?.notes?.trim().slice(0, 500) || null, createdById: me },
    select: SELECT,
  });
  await db!.leadActivity.create({
    data: {
      organizationId: orgId!,
      leadId: lead.id,
      userId: me,
      type: "VIEWING_BOOKED",
      text: `Viewing booked for ${when.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}${listing ? ` · ${listingCode(listing.id)} ${listing.buildingName}` : ""}`,
      data: { viewingId: viewing.id },
    },
  });
  if (!lead.firstContactedAt) await db!.lead.update({ where: { id: lead.id }, data: { firstContactedAt: new Date() } });
  return NextResponse.json({ viewing }, { status: 201 });
}
