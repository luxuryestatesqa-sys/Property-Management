import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { ACTIVITY_FROM, ROW_SELECT, buildWhere, parseFilters } from "@/lib/activityQuery";
import type { ActivityRow } from "@/lib/activityTypes";

const PAGE = 50;

// The activity list, newest first, 50 at a time (?offset=50 for the next page). Managers see every agent;
// an agent only their own activities. All filters come from the query string.
export async function GET(req: NextRequest) {
  const { session, orgId, error } = await requireSession();
  if (error) return error;
  const sp = req.nextUrl.searchParams;
  const where = buildWhere(orgId!, parseFilters(sp), { id: session!.user.id, manager: can(session!.user, "activities.viewAll") });
  const offset = Math.max(0, Number(sp.get("offset")) || 0);
  const oldest = sp.get("sort") === "oldest";

  const [rows, total] = await Promise.all([
    prisma.$queryRaw<ActivityRow[]>(Prisma.sql`SELECT ${ROW_SELECT} FROM ${ACTIVITY_FROM} WHERE ${where} ORDER BY a."createdAt" ${oldest ? Prisma.sql`ASC` : Prisma.sql`DESC`}, a."id" LIMIT ${PAGE} OFFSET ${offset}`),
    prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT count(*)::int AS n FROM ${ACTIVITY_FROM} WHERE ${where}`),
  ]);
  return NextResponse.json({ rows, total: total[0]?.n ?? 0, pageSize: PAGE });
}
