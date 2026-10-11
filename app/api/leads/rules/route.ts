import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, parseJsonBody } from "@/lib/api-helpers";
import { shareOf } from "@/lib/leads/rules";

// Create a routing rule (admins and owners). Added at the end of the list; rules
// run top to bottom and the first match wins.
export async function POST(req: NextRequest) {
  const { db, orgId, error } = await requireAdmin();
  if (error) return error;
  const { value: body, error: bodyError } = await parseJsonBody<{ name?: string; kind?: string; matchText?: string; agentIds?: string[]; shares?: Record<string, number> }>(req);
  if (bodyError) return bodyError;

  const kind = body?.kind === "ROUND_ROBIN" ? "ROUND_ROBIN" : body?.kind === "REGION" ? "REGION" : null;
  const matchText = (body?.matchText ?? "").trim().slice(0, 80);
  const agentIds = Array.isArray(body?.agentIds) ? body!.agentIds.filter((x) => typeof x === "string") : [];
  if (!kind) return NextResponse.json({ error: "Choose a rule type" }, { status: 400 });
  if (kind === "REGION" && !matchText) return NextResponse.json({ error: "Enter the area this rule is for" }, { status: 400 });
  if (agentIds.length === 0) return NextResponse.json({ error: "Choose at least one agent" }, { status: 400 });

  const valid = await db!.user.findMany({ where: { id: { in: agentIds }, status: "ACTIVE" }, select: { id: true } });
  if (valid.length !== agentIds.length) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

  // Keep only a whole-number share between 1 and 10 for the chosen agents.
  const shares: Record<string, number> = {};
  for (const id of agentIds) shares[id] = shareOf(body?.shares, id);

  const last = await db!.assignmentRule.findFirst({ orderBy: { position: "desc" } });
  const name = (body?.name ?? "").trim().slice(0, 60) || (kind === "REGION" ? `${matchText} leads` : "Share leads evenly");
  const rule = await db!.assignmentRule.create({
    data: { organizationId: orgId!, name, kind, matchText: kind === "REGION" ? matchText : null, agentIds, shares, position: (last?.position ?? -1) + 1 },
  });
  return NextResponse.json({ rule }, { status: 201 });
}
