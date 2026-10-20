import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { isManagerRole } from "@/lib/roles";
import { averageMinutes, percent, portalStatus } from "@/lib/dashboardStats";
import { ttlCache } from "@/lib/ttlCache";
import { qatarDay, shiftDay, qatarStartOfDay } from "@/lib/qatarTime";

const DAY = 86400000;

// The numbers cover a whole agency and cost about twenty queries, so every manager who opens the page with the
// same filters within 30 seconds gets the same answer.
const answers = ttlCache<unknown>(30_000, 500);

// Filters change the answer on every request, so this is never cached.
export const dynamic = "force-dynamic";

// Numbers for the dashboard. Managers, admins and owners only: it covers the whole agency.
export async function GET(req: NextRequest) {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;
  if (!isManagerRole(session!.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Filters from the page: ?days=7|30|90 &agent=<userId>|unassigned &type=SALE|RENT &source=PROPERTY_FINDER|META|MANUAL|IMPORT
  const q = req.nextUrl.searchParams;
  const days = [7, 30, 90].includes(Number(q.get("days"))) ? Number(q.get("days")) : 30;
  const agentQ = q.get("agent") || "";
  const typeQ = q.get("type") === "SALE" || q.get("type") === "RENT" ? (q.get("type") as "SALE" | "RENT") : null;
  const sourceQ = ["PROPERTY_FINDER", "META", "MANUAL", "IMPORT"].includes(q.get("source") ?? "") ? (q.get("source") as "PROPERTY_FINDER" | "META" | "MANUAL" | "IMPORT") : null;
  const agentId = agentQ && agentQ !== "unassigned" ? agentQ : null;

  const cacheKey = `${orgId}|${q.toString()}`;
  const cached = answers.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  const leadBase = { ...(sourceQ ? { source: sourceQ } : {}), ...(typeQ ? { listing: { listingType: typeQ } } : {}) };
  const leadWhere = { ...leadBase, ...(agentQ === "unassigned" ? { assignedToId: null } : agentId ? { assignedToId: agentId } : {}) };
  const listingWhere = { status: "ACTIVE" as const, ...(typeQ ? { listingType: typeQ } : {}), ...(agentId ? { createdById: agentId } : {}) };
  const viewingWhere = { status: "SCHEDULED" as const, ...(agentId ? { agentId } : {}), ...(typeQ ? { listing: { listingType: typeQ } } : {}) };
  const taskWhere = { doneAt: null, ...(agentId ? { assignedToId: agentId } : {}) };

  const now = Date.now();
  const today = qatarDay();
  const since = qatarStartOfDay(shiftDay(today, -(days - 1)));
  const weekAgo = qatarStartOfDay(shiftDay(today, -6)); // this week = the last 7 Qatar days, the same days the chart ends with
  const twoWeeksAgo = qatarStartOfDay(shiftDay(today, -13));
    const in7 = new Date(now + 7 * DAY);
  const in60 = new Date(now + 60 * DAY);

  const [thisWeek, lastWeek, perAgentRaw, agents, stages, recent, responded, byListing, portalRows, activeListings, viewings, leases, unassigned, leads30, stageCounts, stageRows, typeMix, availMix, categoryMix, tasksOverdue, tasksToday, viewingsWeek, totalLeads] = await Promise.all([
    db!.lead.count({ where: { ...leadWhere, receivedAt: { gte: weekAgo } } }),
    db!.lead.count({ where: { ...leadWhere, receivedAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
    db!.lead.groupBy({ by: ["assignedToId"], where: { ...leadBase, receivedAt: { gte: since } }, _count: { _all: true } }),
    db!.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    db!.leadStage.findMany({ select: { id: true, kind: true } }),
    db!.lead.groupBy({ by: ["stageId"], where: { ...leadWhere, receivedAt: { gte: since } }, _count: { _all: true } }),
    db!.lead.findMany({ where: { ...leadWhere, receivedAt: { gte: since }, firstContactedAt: { not: null }, ...(agentId ? {} : { assignedToId: { not: null } }) }, select: { receivedAt: true, firstContactedAt: true }, take: 5000 }),
    db!.lead.groupBy({ by: ["listingId"], where: { ...leadWhere, listingId: { not: null }, receivedAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { listingId: "desc" } }, take: 5 }),
    db!.portalListing.findMany({ where: { portal: { in: ["PROPERTY_FINDER", "QATAR_LIVING", "PROPERTY_ORYX"] }, listing: listingWhere }, select: { portal: true, enabled: true, remoteListingId: true, state: true, lastError: true, listing: { select: { status: true } } } }),
    db!.listing.count({ where: listingWhere }),
    db!.viewing.findMany({ where: { ...viewingWhere, scheduledAt: { gte: new Date(now - 3600_000), lte: in7 } }, orderBy: { scheduledAt: "asc" }, take: 8, select: { id: true, scheduledAt: true, lead: { select: { id: true, name: true } }, listing: { select: { id: true, buildingName: true } }, agent: { select: { name: true } } } }),
    db!.listing.findMany({ where: { ...listingWhere, leaseEndDate: { not: null, lte: in60 } }, orderBy: { leaseEndDate: "asc" }, take: 8, select: { id: true, buildingName: true, community: true, leaseEndDate: true } }),
    db!.lead.count({ where: { ...leadBase, assignedToId: null } }),
    db!.lead.findMany({ where: { ...leadWhere, receivedAt: { gte: since } }, select: { receivedAt: true, source: true, sourceLabel: true }, take: 20000 }),
    db!.lead.groupBy({ by: ["stageId"], where: { ...leadWhere, receivedAt: { gte: since } }, _count: { _all: true } }),
    db!.leadStage.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true, kind: true } }),
    db!.listing.groupBy({ by: ["listingType"], where: listingWhere, _count: { _all: true } }),
    db!.listing.groupBy({ by: ["availabilityStatus"], where: listingWhere, _count: { _all: true } }),
    db!.listing.groupBy({ by: ["propertyCategory"], where: listingWhere, _count: { _all: true } }),
    db!.leadTask.count({ where: { ...taskWhere, dueAt: { lt: new Date(now) } } }),
    db!.leadTask.count({ where: { ...taskWhere, dueAt: { gte: new Date(now), lt: new Date(now + DAY) } } }),
    db!.viewing.count({ where: { ...viewingWhere, scheduledAt: { gte: new Date(now), lte: in7 } } }),
    db!.lead.count({ where: { ...leadWhere, receivedAt: { gte: since } } }),
  ]);

  const kind = new Map(stages.map((s) => [s.id, s.kind]));
  const total90 = recent.reduce((n, r) => n + r._count._all, 0);
  const won90 = recent.filter((r) => kind.get(r.stageId) === "WON").reduce((n, r) => n + r._count._all, 0);
  const name = new Map(agents.map((a) => [a.id, a.name]));

  const portals = (["PROPERTY_FINDER", "QATAR_LIVING", "PROPERTY_ORYX"] as const).map((p) => {
    const rows = portalRows.filter((r) => r.portal === p && r.listing.status === "ACTIVE");
    // Property Finder is pushed through its API and has a remote id; Qatar Living and Oryx are pulled from our feed,
    // so for them "switched on and no error" is what published means.
    const status = (r: (typeof rows)[number]) => (p === "PROPERTY_FINDER" ? portalStatus(r) : r.lastError ? "ERROR" : r.enabled ? "PUBLISHED" : "NOT_PUBLISHED");
    const published = rows.filter((r) => status(r) === "PUBLISHED").length;
    const errors = rows.filter((r) => status(r) === "ERROR").length;
    return { portal: p, published, errors, notPublished: Math.max(0, activeListings - published - errors) };
  });

  const topIds = byListing.flatMap((b) => (b.listingId ? [b.listingId] : []));
  const topListings = topIds.length ? await db!.listing.findMany({ where: { id: { in: topIds } }, select: { id: true, buildingName: true, community: true } }) : [];

  // Leads per Qatar calendar day over the chosen range (zero-filled so the line has no gaps).
  const dayList = Array.from({ length: days }, (_, i) => shiftDay(today, i - (days - 1)));
  const perDay = new Map(dayList.map((d) => [d, 0]));
  const bySource = new Map<string, number>();
  for (const l of leads30) {
    const d = qatarDay(l.receivedAt);
    if (perDay.has(d)) perDay.set(d, (perDay.get(d) ?? 0) + 1);
    const label = l.sourceLabel || (l.source === "PROPERTY_FINDER" ? "Property Finder" : l.source === "META" ? "Meta" : l.source === "IMPORT" ? "Import" : "Manual");
    bySource.set(label, (bySource.get(label) ?? 0) + 1);
  }
  const sourceAll = [...bySource.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const sourceRows = sourceAll.length > 6 ? [...sourceAll.slice(0, 5), { label: "Other", count: sourceAll.slice(5).reduce((n, r) => n + r.count, 0) }] : sourceAll;
  const perAgentAll = perAgentRaw
    .map((r) => ({ id: r.assignedToId, name: r.assignedToId ? name.get(r.assignedToId) ?? "Former team member" : "Unassigned", count: r._count._all }))
    .sort((x, y) => y.count - x.count);
  const perAgentRows = perAgentAll.length > 8 ? [...perAgentAll.slice(0, 7), { id: null, name: `Other (${perAgentAll.length - 7})`, count: perAgentAll.slice(7).reduce((n, r) => n + r.count, 0) }] : perAgentAll;
  const stageCount = new Map(stageCounts.map((r) => [r.stageId, r._count._all]));

  const payload = {
    filters: { days, agent: agentQ, type: typeQ, source: sourceQ },
    agents: agents.map((a) => ({ id: a.id, name: a.name })).sort((a, b) => a.name.localeCompare(b.name)),
    leadsDaily: dayList.map((d) => ({ day: d, count: perDay.get(d) ?? 0 })),
    leadSources: sourceRows,
    funnel: stageRows.map((s) => ({ name: s.name, kind: s.kind, count: stageCount.get(s.id) ?? 0 })),
    totalLeads,
    listingMix: {
      type: typeMix.map((r) => ({ label: r.listingType === "SALE" ? "For sale" : "For rent", count: r._count._all })),
      availability: availMix.map((r) => ({ label: r.availabilityStatus[0] + r.availabilityStatus.slice(1).toLowerCase(), count: r._count._all })),
      category: categoryMix.map((r) => ({ label: r.propertyCategory.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()), count: r._count._all })).sort((a, b) => b.count - a.count).slice(0, 6),
    },
    tasks: { overdue: tasksOverdue, today: tasksToday },
    viewingsWeek,
    newLeads: { thisWeek, lastWeek },
    unassigned,
    perAgent: perAgentRows,
    conversion: { rate: percent(won90, total90), won: won90, total: total90 },
    avgFirstResponseMinutes: averageMinutes(responded.map((r) => (r.firstContactedAt ? r.firstContactedAt.getTime() - r.receivedAt.getTime() : NaN))),
    portals,
    activeListings,
    topListings: byListing.flatMap((b) => {
      const l = topListings.find((x) => x.id === b.listingId);
      return l ? [{ id: l.id, name: l.buildingName, community: l.community, enquiries: b._count._all }] : [];
    }),
    viewings,
    leases: leases.map((l) => ({ id: l.id, name: l.buildingName, community: l.community, leaseEndDate: l.leaseEndDate, daysLeft: Math.ceil((l.leaseEndDate!.getTime() - now) / DAY) })),
  };
  answers.set(cacheKey, payload);
  return NextResponse.json(payload);
}
