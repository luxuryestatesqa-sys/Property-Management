import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { isManagerRole } from "@/lib/roles";
import { avatarLink } from "@/lib/avatar";
import { ACTIVITY_FROM, buildWhere, parseFilters, qatarEndExclusive, qatarStart } from "@/lib/activityQuery";

// Numbers above the list: KPI cards, the agent leaderboard and activities per day. All of it is computed in
// the database for the same filters as the list.
export async function GET(req: NextRequest) {
  const { session, orgId, error } = await requireSession();
  if (error) return error;
  const manager = isManagerRole(session!.user.role);
  const f = parseFilters(req.nextUrl.searchParams);
  const where = buildWhere(orgId!, f, { id: session!.user.id, manager });

  const wonStages = Prisma.sql`SELECT "name" FROM "LeadStage" WHERE "organizationId" = ${orgId!} AND "kind"::text = 'WON'`;
  const range = [f.from ? Prisma.sql`l2."firstContactedAt" >= ${qatarStart(f.from)}` : null, f.to ? Prisma.sql`l2."firstContactedAt" < ${qatarEndExclusive(f.to)}` : null].filter((x): x is Prisma.Sql => x !== null);

  const [kpiRows, board, response, perDay, users, stages, usedStages] = await Promise.all([
    prisma.$queryRaw<Record<string, number>[]>(Prisma.sql`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE a."type" = 'call_logged')::int AS calls,
        count(*) FILTER (WHERE a."type" = 'whatsapp_sent')::int AS whatsapp,
        count(*) FILTER (WHERE a."type" IN ('viewing_scheduled', 'viewing_completed'))::int AS viewings,
        count(*) FILTER (WHERE a."type" = 'stage_changed')::int AS stages,
        count(*) FILTER (WHERE a."type" = 'listing_published')::int AS published
      FROM ${ACTIVITY_FROM} WHERE ${where}`),
    prisma.$queryRaw<{ agentId: string | null; name: string | null; calls: number; whatsapp: number; notes: number; viewings: number; stages: number; listings: number; won: number; total: number }[]>(Prisma.sql`
      SELECT a."agentId", u."name",
        count(*) FILTER (WHERE a."type" = 'call_logged')::int AS calls,
        count(*) FILTER (WHERE a."type" = 'whatsapp_sent')::int AS whatsapp,
        count(*) FILTER (WHERE a."type" = 'note_added')::int AS notes,
        count(*) FILTER (WHERE a."type" IN ('viewing_scheduled', 'viewing_completed'))::int AS viewings,
        count(*) FILTER (WHERE a."type" = 'stage_changed')::int AS stages,
        count(*) FILTER (WHERE a."type" IN ('listing_created', 'listing_edited', 'listing_status_changed', 'listing_published'))::int AS listings,
        count(*) FILTER (WHERE a."type" = 'stage_changed' AND a."newValue" IN (${wonStages}))::int AS won,
        count(*)::int AS total
      FROM ${ACTIVITY_FROM} WHERE ${where} GROUP BY a."agentId", u."name" ORDER BY total DESC LIMIT 60`),
    prisma.$queryRaw<{ agentId: string | null; minutes: number }[]>(Prisma.sql`
      SELECT l2."assignedToId" AS "agentId", (avg(extract(epoch FROM (l2."firstContactedAt" - l2."receivedAt"))) / 60)::float AS minutes
      FROM "Lead" l2 WHERE l2."organizationId" = ${orgId!} AND l2."firstContactedAt" IS NOT NULL AND l2."firstContactedAt" >= l2."receivedAt" AND l2."assignedToId" IS NOT NULL
      ${manager ? Prisma.empty : Prisma.sql`AND l2."assignedToId" = ${session!.user.id}`}
      ${range.length ? Prisma.sql`AND ${Prisma.join(range, " AND ")}` : Prisma.empty}
      GROUP BY l2."assignedToId"`),
    prisma.$queryRaw<{ day: string; n: number }[]>(Prisma.sql`
      SELECT to_char(((a."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Qatar')::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
      FROM ${ACTIVITY_FROM} WHERE ${where} GROUP BY 1 ORDER BY 1`),
    manager ? prisma.user.findMany({ where: { organizationId: orgId!, status: "ACTIVE" }, select: { id: true, name: true, avatarUrl: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    prisma.leadStage.findMany({ where: { organizationId: orgId! }, orderBy: { position: "asc" }, select: { name: true } }),
    // stage names that were used before a rename or delete still show on old entries, so keep them filterable
    prisma.activity.findMany({ where: { organizationId: orgId!, type: "stage_changed" }, distinct: ["newValue"], select: { newValue: true }, take: 50 }),
  ]);

  const avg = new Map(response.map((r) => [r.agentId, Math.round(r.minutes)]));
  return NextResponse.json({
    kpis: kpiRows[0],
    // Other = everything not in a column, so a row's columns add up to its Total (Won is part of Stages).
    leaderboard: board.map((b) => ({ ...b, name: b.agentId ? b.name ?? "Former team member" : "System", other: Math.max(0, b.total - b.calls - b.whatsapp - b.notes - b.viewings - b.stages - b.listings), avgFirstResponseMinutes: b.agentId ? avg.get(b.agentId) ?? null : null })),
    perDay,
    meta: { agents: users.map((u) => avatarLink(u)!), stages: [...new Set([...stages.map((s) => s.name), ...usedStages.flatMap((u) => (u.newValue ? [u.newValue] : []))])], canSeeAll: manager },
  });
}
