import { prisma } from "@/lib/prisma";
import { effectivePermissions, type Permission } from "@/lib/permissions";
import { ttlCache } from "@/lib/ttlCache";

// Every request re-checks the user against the database (a removed or deactivated user, a suspended
// agency, a changed role or changed permissions take effect without waiting for the sign-in token to
// expire). With thousands of agents that is the busiest query, so the answer is reused for a few seconds:
// a change reaches the person within this time instead of instantly.
const LIVE_USER_TTL_MS = 15_000;

// `scope`: the people this person's "see all" permissions reach when they manage a team (themselves plus the team
// members), or null when they are not limited to a team. See lib/scope.ts.
export type LiveUser = { status: string; role: string; organizationId: string; orgStatus: string; permissions: Permission[]; scope: string[] | null };

const cache = ttlCache<LiveUser | null>(LIVE_USER_TTL_MS, 5000);

export async function loadLiveUser(userId: string): Promise<LiveUser | null> {
  const hit = cache.get(userId);
  if (hit !== undefined) return hit;
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, role: true, organizationId: true, permissions: true, organization: { select: { status: true, rolePermissions: true } } },
  });
  let scope: string[] | null = null;
  if (row && row.role === "MANAGER") {
    // A Manager in charge of one or more teams is limited to those teams' people.
    const teams = await prisma.team.findMany({ where: { managerId: userId, organizationId: row.organizationId }, select: { id: true } });
    if (teams.length > 0) {
      const members = await prisma.user.findMany({ where: { organizationId: row.organizationId, teamId: { in: teams.map((t) => t.id) } }, select: { id: true } });
      scope = [...new Set([userId, ...members.map((m) => m.id)])];
    }
  }
  const live: LiveUser | null = row && {
    status: row.status,
    role: row.role,
    organizationId: row.organizationId,
    orgStatus: row.organization.status,
    permissions: effectivePermissions(row.role, row.permissions, row.organization.rolePermissions as never),
    scope,
  };
  cache.set(userId, live);
  return live;
}

// Called after a person's role or permissions change, or an agency's templates change, so this copy of
// the app stops using the old answer at once (other running copies pick it up within the time above).
export function forgetLiveUsers() {
  cache.clear();
}
