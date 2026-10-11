import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, parseJsonBody } from "@/lib/api-helpers";

// { active: boolean } turns a rule on/off; { direction: "up" | "down" } moves it in the order.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { db, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const { value: body, error: bodyError } = await parseJsonBody<{ active?: boolean; direction?: string }>(req);
  if (bodyError) return bodyError;

  const rule = await db!.assignmentRule.findFirst({ where: { id } });
  if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  if (typeof body?.active === "boolean") await db!.assignmentRule.update({ where: { id }, data: { active: body.active } });

  if (body?.direction === "up" || body?.direction === "down") {
    const all = await db!.assignmentRule.findMany({ orderBy: { position: "asc" } });
    const i = all.findIndex((r) => r.id === id);
    const j = body.direction === "up" ? i - 1 : i + 1;
    if (j >= 0 && j < all.length) {
      await db!.assignmentRule.update({ where: { id: all[i].id }, data: { position: all[j].position } });
      await db!.assignmentRule.update({ where: { id: all[j].id }, data: { position: all[i].position } });
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { db, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const r = await db!.assignmentRule.deleteMany({ where: { id } });
  if (r.count === 0) return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
