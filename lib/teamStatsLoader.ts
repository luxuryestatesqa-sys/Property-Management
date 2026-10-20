import { avatarLink } from "@/lib/avatar";
import { addNumbers, emptyNumbers, type TeamDetail, type TeamMemberStats, type TeamNumbers } from "@/lib/teamStats";
import type { tenantDb } from "@/lib/tenant";

type Db = ReturnType<typeof tenantDb>;
const DAY = 86_400_000;

// Everything on a team's page, for one team, using the agency-scoped database client.
export async function loadTeamDetail(db: Db, teamId: string, canEdit: boolean): Promise<TeamDetail | null> {
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, manager: { select: { id: true, name: true } }, members: { select: { id: true, name: true, role: true, avatarUrl: true, status: true } } },
  });
  if (!team) return null;

  // The manager is counted too: their own leads and listings are part of the team's work.
  const people = new Map(team.members.map((m) => [m.id, m]));
  if (team.manager && !people.has(team.manager.id)) {
    const m = await db.user.findUnique({ where: { id: team.manager.id }, select: { id: true, name: true, role: true, avatarUrl: true, status: true } });
    if (m) people.set(m.id, m);
  }
  const ids = [...people.keys()];
  const now = new Date();
  const lead = (extra: object) => db.lead.groupBy({ by: ["assignedToId"], where: { assignedToId: { in: ids }, ...extra }, _count: { _all: true } });

  const [listings, leadsAll, leadsWon, leadsLost, leadsNew, viewings, candidates] = await Promise.all([
    db.listing.groupBy({ by: ["createdById", "status", "listingType"], where: { createdById: { in: ids } }, _count: { _all: true } }),
    lead({}),
    lead({ stage: { kind: "WON" } }),
    lead({ stage: { kind: "LOST" } }),
    lead({ receivedAt: { gte: new Date(now.getTime() - 30 * DAY) } }),
    db.viewing.groupBy({ by: ["agentId"], where: { agentId: { in: ids }, status: "SCHEDULED", scheduledAt: { gte: now, lte: new Date(now.getTime() + 7 * DAY) } }, _count: { _all: true } }),
    canEdit
      ? db.user.findMany({ where: { status: "ACTIVE", role: { in: ["AGENT", "MANAGER"] }, OR: [{ teamId: null }, { teamId: { not: teamId } }] }, select: { id: true, name: true, role: true, avatarUrl: true, team: { select: { name: true } } }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  const countOf = (rows: { assignedToId: string | null; _count: { _all: number } }[], id: string) => rows.find((r) => r.assignedToId === id)?._count._all ?? 0;
  const members: TeamMemberStats[] = [...people.values()]
    .map((p) => {
      const mine = listings.filter((l) => l.createdById === p.id);
      const sum = (f: (l: (typeof mine)[number]) => boolean) => mine.filter(f).reduce((n, l) => n + l._count._all, 0);
      const total = countOf(leadsAll, p.id);
      const won = countOf(leadsWon, p.id);
      const lost = countOf(leadsLost, p.id);
      const numbers: TeamNumbers = {
        listings: { total: sum(() => true), active: sum((l) => l.status === "ACTIVE"), rent: sum((l) => l.listingType === "RENT"), sale: sum((l) => l.listingType === "SALE") },
        leads: { total, open: total - won - lost, won, lost, new30: countOf(leadsNew, p.id) },
        viewingsWeek: viewings.find((v) => v.agentId === p.id)?._count._all ?? 0,
      };
      return { ...avatarLink(p)!, isManager: team.manager?.id === p.id, inTeam: team.members.some((x) => x.id === p.id), ...numbers };
    })
    // The manager first, then the busiest people.
    .sort((a, b) => Number(b.isManager) - Number(a.isManager) || b.leads.total + b.listings.total - (a.leads.total + a.listings.total) || a.name.localeCompare(b.name));

  const totalNumbers = members.reduce<TeamNumbers>((sum, m) => addNumbers(sum, m), emptyNumbers());
  return {
    team: { id: team.id, name: team.name, manager: team.manager },
    canEdit,
    members,
    totals: { ...totalNumbers, people: members.length, activePeople: members.filter((m) => m.status === "ACTIVE").length },
    candidates: candidates.map((c) => ({ id: c.id, name: c.name, role: c.role, avatarUrl: avatarLink(c)!.avatarUrl, team: c.team?.name ?? null })),
  };
}
