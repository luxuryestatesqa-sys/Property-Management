import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, requirePermission, parseJsonBody } from "@/lib/api-helpers";
import { ensureStages } from "@/lib/leads/stages";
import { MAX_STAGES, resequence, STAGE_COLORS } from "@/lib/leads/stageOrder";

// The agency's pipeline with how many leads sit in each stage.
export async function GET() {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;
  if (!can(session!.user, "leads.viewAll")) return NextResponse.json({ error: "Only managers can see this" }, { status: 403 });
  const stages = await ensureStages(orgId!);
  const counts = await db!.lead.groupBy({ by: ["stageId"], _count: { _all: true } });
  return NextResponse.json({
    max: MAX_STAGES,
    colors: STAGE_COLORS,
    stages: stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, color: s.color, position: s.position, leads: counts.find((c) => c.stageId === s.id)?._count._all ?? 0 })),
  });
}

// Add a stage (admins and owners). At most MAX_STAGES per agency. It goes at the end of its
// group: open stages, then won, then lost.
export async function POST(req: NextRequest) {
  const { db, orgId, error } = await requirePermission("leads.stages");
  if (error) return error;
  const { value: body, error: bodyError } = await parseJsonBody<{ name?: string; kind?: string; color?: string }>(req);
  if (bodyError) return bodyError;

  const name = (body?.name ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
  const kind = body?.kind === "WON" ? "WON" : body?.kind === "LOST" ? "LOST" : "OPEN";
  const color = STAGE_COLORS.includes(body?.color ?? "") ? body!.color! : STAGE_COLORS[0];
  if (!name) return NextResponse.json({ error: "Give the stage a name" }, { status: 400 });

  await ensureStages(orgId!);
  if ((await db!.leadStage.count()) >= MAX_STAGES) return NextResponse.json({ error: `You can have at most ${MAX_STAGES} stages` }, { status: 400 });
  if (await db!.leadStage.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })) return NextResponse.json({ error: "A stage with that name already exists" }, { status: 409 });

  let stage;
  try {
    stage = await db!.leadStage.create({ data: { organizationId: orgId!, name, kind, color, position: 9999 } });
  } catch {
    return NextResponse.json({ error: "A stage with that name already exists" }, { status: 409 });
  }
  await resequence(db!);
  return NextResponse.json({ stage: { id: stage.id, name: stage.name, kind: stage.kind, color: stage.color } }, { status: 201 });
}
