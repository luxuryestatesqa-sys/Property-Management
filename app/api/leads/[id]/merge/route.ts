import { reachOf, reaches, leadsWhere } from "@/lib/scope";
import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";

// Merge a duplicate lead INTO this one. Everything the duplicate had (timeline, follow-ups, viewings,
// groups) moves over, blanks on this lead are filled from it, and the duplicate is removed. Nothing is
// lost: both timelines end up on the lead that stays. Agents can merge only leads that are theirs.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, scope: teamScope, error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const { value: body, error: bodyError } = await parseJsonBody<{ fromId?: string }>(req);
  if (bodyError) return bodyError;
  const fromId = body?.fromId;
  if (!fromId || fromId === id) return NextResponse.json({ error: "Choose a different lead to merge" }, { status: 400 });

  const mine = leadsWhere(reachOf(session!.user, "leads.viewAll", teamScope));
  const [keep, dupe] = await Promise.all([db!.lead.findFirst({ where: { id, ...mine } }), db!.lead.findFirst({ where: { id: fromId, ...mine } })]);
  if (!keep || !dupe) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const fill = {
    phone: keep.phone ?? dupe.phone,
    email: keep.email ?? dupe.email,
    whatsappUsername: keep.whatsappUsername ?? dupe.whatsappUsername,
    region: keep.region ?? dupe.region,
    listingId: keep.listingId ?? dupe.listingId,
    listingReference: keep.listingReference ?? dupe.listingReference,
    assignedToId: keep.assignedToId ?? dupe.assignedToId,
    firstContactedAt: keep.firstContactedAt ?? dupe.firstContactedAt,
    tags: [...new Set([...keep.tags, ...dupe.tags])],
    // the earlier enquiry is the real "received" time
    receivedAt: dupe.receivedAt < keep.receivedAt ? dupe.receivedAt : keep.receivedAt,
  };

  const keepGroups = new Set((await db!.leadGroupLink.findMany({ where: { leadId: keep.id }, select: { groupId: true } })).map((g) => g.groupId));
  const dupeGroups = await db!.leadGroupLink.findMany({ where: { leadId: dupe.id }, select: { groupId: true } });

  await db!.$transaction([
    db!.leadActivity.updateMany({ where: { leadId: dupe.id }, data: { leadId: keep.id } }),
    db!.leadTask.updateMany({ where: { leadId: dupe.id }, data: { leadId: keep.id } }),
    db!.viewing.updateMany({ where: { leadId: dupe.id }, data: { leadId: keep.id } }),
    db!.leadGroupLink.deleteMany({ where: { leadId: dupe.id } }),
    ...(dupeGroups.filter((g) => !keepGroups.has(g.groupId)).length
      ? [db!.leadGroupLink.createMany({ data: dupeGroups.filter((g) => !keepGroups.has(g.groupId)).map((g) => ({ organizationId: orgId!, leadId: keep.id, groupId: g.groupId })) })]
      : []),
    db!.lead.delete({ where: { id: dupe.id } }),
    db!.lead.update({ where: { id: keep.id }, data: fill }),
    db!.leadActivity.create({ data: { organizationId: orgId!, leadId: keep.id, userId: session!.user.id, type: "MERGED", text: `Merged with a duplicate lead (${dupe.name}${dupe.phone ? `, ${dupe.phone}` : ""}). Its history was added to this timeline.` } }),
  ]);
  return NextResponse.json({ ok: true });
}
