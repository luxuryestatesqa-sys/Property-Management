import { can } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";

// Cheap counts for the sidebar badge: leads still in the first (New) stage that the
// caller may see, plus the caller's own follow-ups that are now due.
export async function GET() {
  const { session, db, error } = await requireSession();
  if (error) return error;
  const me = session!.user.id;
  const [overdueCount, first] = await Promise.all([
    db!.leadTask.count({ where: { assignedToId: me, doneAt: null, dueAt: { lte: new Date() } } }),
    db!.leadStage.findFirst({ orderBy: { position: "asc" } }),
  ]);
  if (!first) return NextResponse.json({ newCount: 0, overdueCount });
  const newCount = await db!.lead.count({ where: { stageId: first.id, ...(can(session!.user, "leads.viewAll") ? {} : { assignedToId: me }) } });
  return NextResponse.json({ newCount, overdueCount });
}
