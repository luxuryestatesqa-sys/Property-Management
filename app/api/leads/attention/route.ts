import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { isManagerRole } from "@/lib/roles";

const WAITING_MINUTES = 15;

// What needs the signed-in person's attention right now: follow-ups that are overdue
// or due today, and new leads nobody has contacted for a while.
export async function GET() {
  const { session, db, error } = await requireSession();
  if (error) return error;
  const me = session!.user.id;
  const manager = isManagerRole(session!.user.role);
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const tasks = await db!.leadTask.findMany({
    where: { assignedToId: me, doneAt: null, dueAt: { lte: endOfToday } },
    orderBy: { dueAt: "asc" },
    take: 50,
    select: { id: true, text: true, dueAt: true, lead: { select: { id: true, name: true, phone: true } } },
  });

  const first = await db!.leadStage.findFirst({ orderBy: { position: "asc" } });
  const waiting = first
    ? await db!.lead.findMany({
        where: { stageId: first.id, firstContactedAt: null, receivedAt: { lte: new Date(now.getTime() - WAITING_MINUTES * 60000) }, ...(manager ? {} : { assignedToId: me }) },
        orderBy: { receivedAt: "asc" },
        take: 20,
        select: { id: true, name: true, receivedAt: true, assignedTo: { select: { name: true } } },
      })
    : [];

  return NextResponse.json({
    overdue: tasks.filter((t) => t.dueAt < now),
    today: tasks.filter((t) => t.dueAt >= now),
    waiting,
  });
}
