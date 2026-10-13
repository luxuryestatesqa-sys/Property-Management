import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { isManagerRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { qatarEndOfDay } from "@/lib/qatarTime";

// What needs the signed-in person's attention right now: follow-ups that are overdue
// or due today, and new leads nobody has contacted for a while.
export async function GET() {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;
  const org = await prisma.organization.findUnique({ where: { id: orgId! }, select: { contactSlaHours: true } });
  const waitingMs = (org?.contactSlaHours ?? 2) * 3600_000;
  const me = session!.user.id;
  const manager = isManagerRole(session!.user.role);
  const now = new Date();
  const endOfToday = qatarEndOfDay();

  const tasks = await db!.leadTask.findMany({
    where: { assignedToId: me, doneAt: null, dueAt: { lte: endOfToday } },
    orderBy: { dueAt: "asc" },
    take: 50,
    select: { id: true, text: true, dueAt: true, lead: { select: { id: true, name: true, phone: true } } },
  });

  const first = await db!.leadStage.findFirst({ orderBy: { position: "asc" } });
  const waitingWhere = first ? { stageId: first.id, firstContactedAt: null, receivedAt: { lte: new Date(now.getTime() - waitingMs) }, ...(manager ? {} : { assignedToId: me }) } : null;
  const waitingCount = waitingWhere ? await db!.lead.count({ where: waitingWhere }) : 0;
  const waiting = first
    ? await db!.lead.findMany({
        where: { stageId: first.id, firstContactedAt: null, receivedAt: { lte: new Date(now.getTime() - waitingMs) }, ...(manager ? {} : { assignedToId: me }) },
        orderBy: { receivedAt: "asc" },
        take: 20,
        select: { id: true, name: true, receivedAt: true, assignedTo: { select: { name: true } } },
      })
    : [];

  return NextResponse.json({
    overdue: tasks.filter((t) => t.dueAt < now),
    today: tasks.filter((t) => t.dueAt >= now),
    waiting,
    waitingCount,
  });
}
