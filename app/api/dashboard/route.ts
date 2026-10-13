import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-helpers";
import { isManagerRole } from "@/lib/roles";
import { averageMinutes, percent, portalStatus } from "@/lib/dashboardStats";

const DAY = 86400000;

// Numbers for the dashboard. Managers, admins and owners only: it covers the whole agency.
export async function GET() {
  const { session, db, error } = await requireSession();
  if (error) return error;
  if (!isManagerRole(session!.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = Date.now();
  const weekAgo = new Date(now - 7 * DAY);
  const twoWeeksAgo = new Date(now - 14 * DAY);
  const monthAgo = new Date(now - 30 * DAY);
  const in7 = new Date(now + 7 * DAY);
  const in60 = new Date(now + 60 * DAY);

  const [thisWeek, lastWeek, perAgentRaw, agents, stages, recent, responded, byListing, portalRows, activeListings, viewings, leases, unassigned] = await Promise.all([
    db!.lead.count({ where: { receivedAt: { gte: weekAgo } } }),
    db!.lead.count({ where: { receivedAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
    db!.lead.groupBy({ by: ["assignedToId"], where: { receivedAt: { gte: monthAgo } }, _count: { _all: true } }),
    db!.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    db!.leadStage.findMany({ select: { id: true, kind: true } }),
    db!.lead.groupBy({ by: ["stageId"], where: { receivedAt: { gte: new Date(now - 90 * DAY) } }, _count: { _all: true } }),
    db!.lead.findMany({ where: { receivedAt: { gte: monthAgo }, firstContactedAt: { not: null } }, select: { receivedAt: true, firstContactedAt: true }, take: 5000 }),
    db!.lead.groupBy({ by: ["listingId"], where: { listingId: { not: null } }, _count: { _all: true }, orderBy: { _count: { listingId: "desc" } }, take: 5 }),
    db!.portalListing.findMany({ where: { portal: { in: ["PROPERTY_FINDER", "QATAR_LIVING", "PROPERTY_ORYX"] } }, select: { portal: true, enabled: true, remoteListingId: true, state: true, lastError: true, listing: { select: { status: true } } } }),
    db!.listing.count({ where: { status: "ACTIVE" } }),
    db!.viewing.findMany({ where: { status: "SCHEDULED", scheduledAt: { gte: new Date(now - 3600_000), lte: in7 } }, orderBy: { scheduledAt: "asc" }, take: 8, select: { id: true, scheduledAt: true, lead: { select: { id: true, name: true } }, listing: { select: { id: true, buildingName: true } }, agent: { select: { name: true } } } }),
    db!.listing.findMany({ where: { status: "ACTIVE", leaseEndDate: { not: null, lte: in60 } }, orderBy: { leaseEndDate: "asc" }, take: 8, select: { id: true, buildingName: true, community: true, leaseEndDate: true } }),
    db!.lead.count({ where: { assignedToId: null } }),
  ]);

  const kind = new Map(stages.map((s) => [s.id, s.kind]));
  const total90 = recent.reduce((n, r) => n + r._count._all, 0);
  const won90 = recent.filter((r) => kind.get(r.stageId) === "WON").reduce((n, r) => n + r._count._all, 0);
  const name = new Map(agents.map((a) => [a.id, a.name]));

  const portals = (["PROPERTY_FINDER", "QATAR_LIVING", "PROPERTY_ORYX"] as const).map((p) => {
    const rows = portalRows.filter((r) => r.portal === p && r.listing.status === "ACTIVE");
    const published = rows.filter((r) => portalStatus(r) === "PUBLISHED").length;
    const errors = rows.filter((r) => portalStatus(r) === "ERROR").length;
    return { portal: p, published, errors, notPublished: Math.max(0, activeListings - published - errors) };
  });

  const topIds = byListing.flatMap((b) => (b.listingId ? [b.listingId] : []));
  const topListings = topIds.length ? await db!.listing.findMany({ where: { id: { in: topIds } }, select: { id: true, buildingName: true, community: true } }) : [];

  return NextResponse.json({
    newLeads: { thisWeek, lastWeek },
    unassigned,
    perAgent: perAgentRaw
      .map((r) => ({ id: r.assignedToId, name: r.assignedToId ? name.get(r.assignedToId) ?? "Former team member" : "Unassigned", count: r._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
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
  });
}
