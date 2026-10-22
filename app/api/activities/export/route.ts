import { csvCell } from "@/lib/csv";
import { reachOf, reaches, leadsWhere, type Reach } from "@/lib/scope";
import { can } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { typeLabel, describe, type ActivityRow } from "@/lib/activityTypes";
import { ACTIVITY_FROM, ROW_SELECT, buildWhere, parseFilters } from "@/lib/activityQuery";

const MAX_ROWS = 100_000;
const esc = csvCell;
const qatar = (d: Date) => new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Qatar", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

// Every row matching the current filters (not just the loaded page) as a CSV file.
export async function GET(req: NextRequest) {
  const { session, orgId, scope: teamScope, error } = await requireSession();
  if (error) return error;
  const where = buildWhere(orgId!, parseFilters(req.nextUrl.searchParams), { id: session!.user.id, manager: can(session!.user, "activities.viewAll"), team: (() => { const r = reachOf(session!.user, "activities.viewAll", teamScope); return r === true ? null : r; })() });
  const rows = await prisma.$queryRaw<ActivityRow[]>(Prisma.sql`SELECT ${ROW_SELECT} FROM ${ACTIVITY_FROM} WHERE ${where} ORDER BY a."createdAt" DESC, a."id" LIMIT ${MAX_ROWS}`);
  const head = ["Date & time (Qatar)", "Agent", "Type", "Lead", "Lead phone", "Property", "Details", "Source"];
  const lines = rows.map((r) => [qatar(new Date(r.createdAt)), r.agentName ?? (r.agentId ? "Former team member" : "System"), typeLabel(r.type), r.leadName ?? "", r.leadPhone ?? "", r.listingId ? `LST-${String(r.listingId).padStart(6, "0")} ${r.listingName ?? ""}`.trim() : "", describe(r), r.source ?? ""].map(esc).join(","));
  const body = "﻿" + [head.map(esc).join(","), ...lines].join("\r\n");
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="activities-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
