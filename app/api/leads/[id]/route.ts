import { reachOf, reaches, leadsWhere } from "@/lib/scope";
import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { visibleListingsWhere } from "@/lib/listingPrivacy";
import { listingCode } from "@/lib/format";
import { listingImageUrl } from "@/lib/listingImages";
import { extractLeadDetails } from "@/lib/leads/details";
import { themedStages, stageThemeColor } from "@/lib/leads/stages";

// Everything the lead detail page needs: the lead, its listing, the timeline,
// the other leads from the same phone number, and the pickers (stages, agents).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, scope: teamScope, error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const manager = can(session!.user, "leads.viewAll");
  const reach = reachOf(session!.user, "leads.viewAll", teamScope);

  const lead = await db!.lead.findFirst({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true, avatarUrl: true, whatsapp: true } },
      stage: true,
      listing: {
        select: {
          id: true, buildingName: true, area: true, community: true, listingType: true, rentPrice: true, salePrice: true,
          propertyCategory: true, bedrooms: true, sizeSqm: true, shareToken: true, unitDetailsPrivate: true, floor: true, apartmentNumber: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true, createdAt: true } },
        },
      },
      activities: { orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      tasks: { orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { dueAt: "asc" }], take: 50 },
      groupLinks: { select: { group: { select: { id: true, name: true, color: true } } } },
    },
  });
  if (!lead || !reaches(reach, lead.assignedToId)) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const [stages, agents, related, groups] = await Promise.all([
    db!.leadStage.findMany({ orderBy: { position: "asc" } }),
    manager ? db!.user.findMany({ where: { status: "ACTIVE", ...(reach === true ? {} : { id: { in: reach } }) }, select: { id: true, name: true, avatarUrl: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    lead.phone
      ? db!.lead.findMany({
          where: { phone: lead.phone, NOT: { id: lead.id }, ...leadsWhere(reach) },
          orderBy: { receivedAt: "desc" },
          take: 5,
          select: { id: true, name: true, receivedAt: true, listingReference: true, stage: { select: { name: true, kind: true, color: true } } },
        })
      : Promise.resolve([]),
    db!.leadGroup.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
  ]);

  const { raw, callRecordUrl, groupLinks, ...rest } = lead;
  return NextResponse.json({
    groups,
    // Attachments keep only their metadata here; the file is fetched from the attachments route.
    lead: { ...rest, stage: { ...rest.stage, color: stageThemeColor(rest.stage.kind, rest.stage.id === stages.find((s) => s.kind === "OPEN")?.id) }, activities: rest.activities.map((a) => (a.type === "VOICE_NOTE" || a.type === "DOCUMENT" ? { ...a, data: { name: (a.data as { name?: string } | null)?.name, mime: (a.data as { mime?: string } | null)?.mime, size: (a.data as { size?: number } | null)?.size } } : a.type === "STAGE_CHANGED" ? a : { ...a, data: undefined })), callRecordUrl, details: extractLeadDetails({ sellerProperty: lead.sellerProperty, raw }), groups: groupLinks.map((g) => g.group), listing: lead.listing ? { ...lead.listing, cover: lead.listing.images[0] ? listingImageUrl(lead.listing.id, lead.listing.images[0]) : null, images: undefined } : null },
    stages: themedStages(stages).map((s) => ({ id: s.id, name: s.name, kind: s.kind, color: s.color, position: s.position })),
    agents,
    related: related.map((r) => ({ ...r, stage: { ...r.stage, color: stageThemeColor(r.stage.kind, false) } })),
    canManage: manager,
  });
}

// Move a lead to another stage. Managers and above can move any lead; an agent only
// their own. The move is written to the lead's timeline, and the first move out of
// the starting stage counts as the first response.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, scope: teamScope, error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const { value: body, error: bodyError } = await parseJsonBody<{ stageId?: string; assignedToId?: string | null; listing?: string | number | null }>(req);
  if (bodyError) return bodyError;
  if (!body || (body.stageId === undefined && body.assignedToId === undefined && body.listing === undefined)) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const lead = await db!.lead.findFirst({ where: { id }, include: { stage: true } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const reach = reachOf(session!.user, "leads.viewAll", teamScope);
  if (!reaches(reach, lead.assignedToId)) {
    return NextResponse.json({ error: "Not your lead" }, { status: 403 });
  }
  // Reassigning is for managers and above only.
  if (body.assignedToId !== undefined) {
    if (!can(session!.user, "leads.assign")) return NextResponse.json({ error: "Only managers can reassign leads" }, { status: 403 });
    // A team manager moves leads between their own team's people only.
    if (reach !== true && (!body.assignedToId || !reaches(reach, body.assignedToId))) return NextResponse.json({ error: "You can only assign to people in your team" }, { status: 403 });
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
  // Link the lead to a property ("LST-000085" or 85), or unlink with null.
  if (body.listing !== undefined) {
    let target: { id: number; buildingName: string } | null = null;
    if (body.listing !== null && body.listing !== "") {
      const n = Number(String(body.listing).replace(/\D/g, ""));
      target = Number.isFinite(n) && n > 0 ? await db!.listing.findFirst({ where: { id: n, ...visibleListingsWhere(session!.user.id, reachOf(session!.user, "listings.viewAll", teamScope)) }, select: { id: true, buildingName: true } }) : null;
      if (!target) return NextResponse.json({ error: "No property found with that ID" }, { status: 404 });
    }
    await db!.lead.update({ where: { id }, data: { listingId: target?.id ?? null, listingReference: target ? listingCode(target.id) : null } });
    await db!.leadActivity.create({ data: { organizationId: orgId!, leadId: id, userId: session!.user.id, type: "PROPERTY_LINKED", text: target ? `Interested in ${listingCode(target.id)} (${target.buildingName})` : "Property link removed", data: { listingId: target?.id ?? null } } });
    if (body.stageId === undefined) return NextResponse.json({ ok: true });
  }
  if (!body.stageId || typeof body.stageId !== "string") return NextResponse.json({ error: "stageId is required" }, { status: 400 });
  const [stage, firstStage] = await Promise.all([
    db!.leadStage.findFirst({ where: { id: body.stageId } }),
    db!.leadStage.findFirst({ orderBy: { position: "asc" } }),
  ]);
  if (!stage) return NextResponse.json({ error: "Unknown stage" }, { status: 404 });
  if (stage.id === lead.stageId) return NextResponse.json({ ok: true });

  await Promise.all([
    db!.lead.update({
      where: { id },
      data: { stageId: stage.id, ...(!lead.firstContactedAt && lead.stageId === firstStage?.id ? { firstContactedAt: new Date() } : {}) },
    }),
    db!.leadActivity.create({
      data: {
        organizationId: orgId!,
        leadId: id,
        userId: session!.user.id,
        type: "STAGE_CHANGED",
        text: `Stage: ${lead.stage.name} → ${stage.name}`,
        data: { from: lead.stageId, to: stage.id },
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
