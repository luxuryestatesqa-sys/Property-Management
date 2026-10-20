import { reachOf, reaches, leadsWhere } from "@/lib/scope";
import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { createLeads, IntakeError, type NewLeadInput } from "@/lib/leads/intake";
import { parseReceivedAt, resolveOrigin } from "@/lib/leads/csv";

const MAX_ROWS = 1000;

interface Row {
  name?: string;
  phone?: string;
  email?: string;
  region?: string;
  notes?: string;
  date?: string;
  extra?: Record<string, string>;
}

// Import leads from a file. The browser reads the CSV/Excel file and sends the rows here, already
// matched to our fields. Numbers or emails we already have are skipped, never overwritten.
// Agents import into their own list; managers choose who gets them.
export async function POST(req: NextRequest) {
  const { session, db, orgId, scope: teamScope, error } = await requireSession();
  if (error) return error;
  const { value: body, error: bodyError } = await parseJsonBody<{ rows?: Row[]; channel?: string; assign?: { mode?: string; agentId?: string }; stageId?: string; fileName?: string }>(req);
  if (bodyError) return bodyError;

  const rows = Array.isArray(body?.rows) ? body!.rows : [];
  if (rows.length === 0) return NextResponse.json({ error: "The file has no leads in it" }, { status: 400 });
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Import up to ${MAX_ROWS} leads at a time. This file has ${rows.length}.` }, { status: 400 });

  const manager = can(session!.user, "leads.assign");
  const reach = reachOf(session!.user, "leads.assign", teamScope);
  if (reach !== true && body?.assign?.mode === "rules") return NextResponse.json({ error: "Assignment rules are run by your agency admin" }, { status: 403 });
  if (body?.assign?.mode === "agent" && body.assign.agentId && !reaches(reach, body.assign.agentId)) return NextResponse.json({ error: "You can only assign to people in your team" }, { status: 403 });
  const mode = manager && (body?.assign?.mode === "rules" || body?.assign?.mode === "agent" || body?.assign?.mode === "none") ? body.assign.mode : "self";
  if (mode === "agent" && !body?.assign?.agentId) return NextResponse.json({ error: "Choose an agent" }, { status: 400 });
  const origin = resolveOrigin(body?.channel);
  const channel = origin.channel;

  const inputs: NewLeadInput[] = rows.map((r) => ({ name: r.name, phone: r.phone, email: r.email, region: r.region, notes: r.notes, channel, sourceLabel: origin.sourceLabel, receivedAt: parseReceivedAt(r.date), extra: r.extra && typeof r.extra === "object" ? r.extra : undefined }));

  try {
    const me = await db!.user.findFirst({ where: { id: session!.user.id }, select: { name: true } });
    const r = await createLeads(orgId!, inputs, { source: "IMPORT", actor: { id: session!.user.id, name: me?.name ?? "a team member" }, assign: { mode, agentId: body?.assign?.agentId }, stageId: manager ? body?.stageId : undefined, fileName: body?.fileName }, 2);
    return NextResponse.json({ created: r.created, duplicates: r.duplicates.length, invalid: r.invalid.length, problems: [...r.invalid.map((x) => ({ row: x.row, reason: x.reason })), ...r.duplicates.map((x) => ({ row: x.row, reason: x.reason }))].sort((a, b) => a.row - b.row).slice(0, 50) });
  } catch (e) {
    if (e instanceof IntakeError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
