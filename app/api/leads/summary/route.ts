import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { isManagerRole } from "@/lib/roles";

// Cheap count for the sidebar badge: leads still in the first (New) stage that the
// caller may see.
export async function GET() {
  const { session, db, error } = await requireSession();
  if (error) return error;
  const first = await db!.leadStage.findFirst({ orderBy: { position: "asc" } });
  if (!first) return NextResponse.json({ newCount: 0 });
  const newCount = await db!.lead.count({ where: { stageId: first.id, ...(isManagerRole(session!.user.role) ? {} : { assignedToId: session!.user.id }) } });
  return NextResponse.json({ newCount });
}
