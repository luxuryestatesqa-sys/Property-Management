import { reachOf, reaches, leadsWhere } from "@/lib/scope";
import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { advanceOnFirstContact } from "@/lib/leads/stages";

const TYPES = new Set(["NOTE", "CALL_LOGGED", "WHATSAPP_LOGGED", "VIEWING_BOOKED"]);

// Adds an entry to a lead's timeline: a note, or a quick log of a call / WhatsApp /
// viewing. The first logged contact counts as the agent's first response.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, scope: teamScope, error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const { value: body, error: bodyError } = await parseJsonBody<{ type?: string; text?: string }>(req);
  if (bodyError) return bodyError;

  const type = body?.type ?? "NOTE";
  const text = (body?.text ?? "").trim().slice(0, 2000);
  if (!TYPES.has(type)) return NextResponse.json({ error: "Unknown activity type" }, { status: 400 });
  if (type === "NOTE" && !text) return NextResponse.json({ error: "Write a note first" }, { status: 400 });

  const lead = await db!.lead.findFirst({ where: { id } });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!reaches(reachOf(session!.user, "leads.viewAll", teamScope), lead.assignedToId)) {
    return NextResponse.json({ error: "Not your lead" }, { status: 403 });
  }

  const defaults: Record<string, string> = { CALL_LOGGED: "Called the lead", WHATSAPP_LOGGED: "Sent a WhatsApp message", VIEWING_BOOKED: "Viewing booked" };
  const activity = await db!.leadActivity.create({
    data: { organizationId: orgId!, leadId: id, userId: session!.user.id, type, text: text || defaults[type] },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
  // A first outbound call, WhatsApp or note takes a lead out of "New" (and stamps the first response time).
  if (type === "NOTE" || type === "CALL_LOGGED" || type === "WHATSAPP_LOGGED") await advanceOnFirstContact(db!, orgId!, lead, session!.user.id);
  else if (!lead.firstContactedAt) await db!.lead.update({ where: { id }, data: { firstContactedAt: new Date() } });
  return NextResponse.json({ activity }, { status: 201 });
}
