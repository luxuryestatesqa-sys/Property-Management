import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-helpers";

// Deleting a group only removes the label; the leads themselves are untouched.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { db, error } = await requireAdmin();
  if (error) return error;
  const { groupId } = await params;
  const r = await db!.leadGroup.deleteMany({ where: { id: groupId } });
  if (r.count === 0) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
