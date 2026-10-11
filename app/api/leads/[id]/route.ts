import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { isManagerRole } from "@/lib/roles";
import { extractLeadDetails } from "@/lib/leads/details";

// Everything the lead detail page needs: the lead, its listing, the timeline,
// the other leads from the same phone number, and the pickers (stages, agents).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const manager = isManagerRole(session!.user.role);

  const lead = await db!.lead.findFirst({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true, avatarUrl: true, whatsapp: true } },
      stage: true,
      listing: {
        select: {
          id: true, buildingName: true, area: true, community: true, listingType: true, rentPrice: true, salePrice: true,
          propertyCategory: true, bedrooms: true, sizeSqm: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
        },
      },
      activities: { orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      tasks: { orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { dueAt: "asc" }], take: 50 },
      groupLinks: { select: { group: { select: { id: true, name: true, color: true } } } },
    },
  });
  if (!lead || (!manager && lead.assignedToId !== session!.user.id)) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const [stages, agents, related] = await Promise.all([
    db!.leadStage.findMany({ orderBy: { position: "asc" } }),
    manager ? db!.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, avatarUrl: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    lead.phone
      ? db!.lead.findMany({
          where: { phone: lead.phone, NOT: { id: lead.id }, ...(manager ? {} : { assignedToId: session!.user.id }) },
          orderBy: { receivedAt: "desc" },
          take: 5,
          select: { id: true, name: true, receivedAt: true, listingReference: true, stage: { select: { name: true, color: true } } },
        })
      : Promise.resolve([]),
  ]);

  const groups = await db!.leadGroup.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } });

  const { raw, callRecordUrl, groupLinks, ...rest } = lead;
  return NextResponse.json({
    groups,
    // Attachments keep only their metadata here; the file is fetched from the attachments route.
    lead: { ...rest, activities: rest.activities.map((a) => (a.type === "VOICE_NOTE" || a.type === "DOCUMENT" ? { ...a, data: { name: (a.data as { name?: string } | null)?.name, mime: (a.data as { mime?: string } | null)?.mime, size: (a.data as { size?: number } | null)?.size } } : a.type === "STAGE_CHANGED" ? a : { ...a, data: undefined })), callRecordUrl, details: extractLeadDetails({ sellerProperty: lead.sellerProperty, raw }), groups: groupLinks.map((g) => g.group), listing: lead.listing ? { ...lead.listing, cover: lead.listing.images[0]?.url ?? null, images: undefined } : null },
    stages: stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, color: s.color, position: s.position })),
    agents,
    related,
    canManage: manager,
  });
}

// Move a lead to another stage. Managers and above can move any lead; an agent only
// their own. The move is written to the lead's timeline, and the first move out of
// the starting stage counts as the first response.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const { value: body, error: bodyError } = await parseJsonBody<{ stageId?: string; assignedToId?: string | null }>(req);
  if (bodyError) return bodyError;
  if (!body || (body.stageId === undefined && body.assignedToId === undefined)) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const lead = await db!.lead.findFirst({ where: { id }, include: { stage: true } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!isManagerRole(session!.user.role) && lead.assignedToId !== session!.user.id) {
    return NextResponse.json({ error: "Not your lead" }, { status: 403 });
  }
  // Reassigning is for managers and above only.
  if (body.assignedToId !== undefined) {
    if (!isManagerRole(session!.user.role)) return NextResponse.json({ error: "Only managers can reassign leads" }, { status: 403 });
    if (body.assignedToId !== lead.assignedToId) {
      const target = body.assignedToId ? await db!.user.findFirst({ where: { id: body.assignedToId, status: "ACTIVE" }, select: { id: true, name: true } }) : null;
      if (body.assignedToId && !target) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
      await db!.lead.update({ where: { id }, data: { assignedToId: target?.id ?? null } });
      await db!.leadActivity.create({
        data: { organizationId: orgId!, leadId: id, userId: session!.user.id, type: "ASSIGNED", text: target ? `Assigned to ${target.name}` : "Moved back to Unassigned", data: { from: lead.assignedToId, to: target?.id ?? null } },
      });
    }
    if (body.stageId === undefined) return NextResponse.json({ ok: true });
  }
  if (!body.stageId || typeof body.stageId !== "string") return NextResponse.json({ error: "stageId is required" }, { status: 400 });
  const stage = await db!.leadStage.findFirst({ where: { id: body.stageId } });
  if (!stage) return NextResponse.json({ error: "Unknown stage" }, { status: 404 });
  if (stage.id === lead.stageId) return NextResponse.json({ ok: true });

  const firstStage = await db!.leadStage.findFirst({ orderBy: { position: "asc" } });
  await db!.lead.update({
    where: { id },
    data: { stageId: stage.id, ...(!lead.firstContactedAt && lead.stageId === firstStage?.id ? { firstContactedAt: new Date() } : {}) },
  });
  await db!.leadActivity.create({
    data: {
      organizationId: orgId!,
      leadId: id,
      userId: session!.user.id,
      type: "STAGE_CHANGED",
      text: `Stage: ${lead.stage.name} → ${stage.name}`,
      data: { from: lead.stageId, to: stage.id },
    },
  });
  return NextResponse.json({ ok: true });
}
