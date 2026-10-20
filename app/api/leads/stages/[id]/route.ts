import { NextRequest, NextResponse } from "next/server";
import { requirePermission, parseJsonBody } from "@/lib/api-helpers";
import { resequence, STAGE_COLORS } from "@/lib/leads/stageOrder";

// Rename, recolour or move a stage up/down within its group (admins and owners).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { db, error } = await requirePermission("leads.stages");
  if (error) return error;
  const { id } = await params;
  const { value: body, error: bodyError } = await parseJsonBody<{ name?: string; color?: string; direction?: "up" | "down" }>(req);
  if (bodyError) return bodyError;

  const stage = await db!.leadStage.findFirst({ where: { id } });
  if (!stage) return NextResponse.json({ error: "Stage not found" }, { status: 404 });

  if (body?.direction === "up" || body?.direction === "down") {
    const group = await db!.leadStage.findMany({ where: { kind: stage.kind }, orderBy: { position: "asc" } });
    const i = group.findIndex((s) => s.id === id);
    const other = group[body.direction === "up" ? i - 1 : i + 1];
    if (other) {
      await db!.leadStage.update({ where: { id }, data: { position: other.position } });
      await db!.leadStage.update({ where: { id: other.id }, data: { position: stage.position } });
    }
    return NextResponse.json({ ok: true });
  }

  const data: { name?: string; color?: string } = {};
  if (body?.name !== undefined) {
    const name = body.name.trim().replace(/\s+/g, " ").slice(0, 30);
    if (!name) return NextResponse.json({ error: "Give the stage a name" }, { status: 400 });
    const clash = await db!.leadStage.findFirst({ where: { name: { equals: name, mode: "insensitive" }, NOT: { id } } });
    if (clash) return NextResponse.json({ error: "A stage with that name already exists" }, { status: 409 });
    data.name = name;
  }
  if (body?.color !== undefined) {
    if (!STAGE_COLORS.includes(body.color)) return NextResponse.json({ error: "Choose one of the colours" }, { status: 400 });
    data.color = body.color;
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  await db!.leadStage.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

// Delete a stage. If leads are in it, ?moveTo=<stageId> says where they go. The pipeline always
// keeps at least one open stage, because that is where new leads start.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { db, error } = await requirePermission("leads.stages");
  if (error) return error;
  const { id } = await params;
  const moveTo = req.nextUrl.searchParams.get("moveTo");

  const stage = await db!.leadStage.findFirst({ where: { id } });
  if (!stage) return NextResponse.json({ error: "Stage not found" }, { status: 404 });
  if (stage.kind === "OPEN" && (await db!.leadStage.count({ where: { kind: "OPEN" } })) <= 1) {
    return NextResponse.json({ error: "Keep at least one open stage. New leads start there." }, { status: 400 });
  }

  const inStage = await db!.lead.count({ where: { stageId: id } });
  if (inStage > 0) {
    const target = moveTo && moveTo !== id ? await db!.leadStage.findFirst({ where: { id: moveTo } }) : null;
    if (!target) return NextResponse.json({ error: `${inStage} lead${inStage === 1 ? " is" : "s are"} in this stage. Choose where to move them.`, leads: inStage }, { status: 409 });
    await db!.lead.updateMany({ where: { stageId: id }, data: { stageId: target.id } });
  }
  await db!.leadStage.delete({ where: { id } });
  await resequence(db!);
  return NextResponse.json({ ok: true, moved: inStage });
}
