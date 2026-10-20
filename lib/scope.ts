import type { Prisma } from "@prisma/client";
import { can } from "@/lib/permissions";

// Whose work a person may see and manage.
//
//   true      = everyone in the agency (Owner, Admin, a Manager who is not in charge of a team, or anyone given
//               the "see all" permission without a team)
//   [ids...]  = only these people: always yourself, plus your team members when you manage a team
//
// A Manager in charge of a team (Team.managerId) is limited to that team; this is what makes "Sales Team A" and
// "Sales Team B" invisible to each other's managers. The ids come from lib/liveUser.ts.
export type Reach = true | string[];

type Viewer = { id: string; role?: string | null; permissions?: readonly string[] | null };

// `scope` is the person's team ids (including themselves), or null when they are not limited to a team.
export function reachOf(user: Viewer, permission: Parameters<typeof can>[1], scope: string[] | null | undefined): Reach {
  if (!can(user, permission)) return [user.id];
  return scope && scope.length > 0 ? scope : true;
}

export const reaches = (reach: Reach, personId: string | null | undefined): boolean => reach === true || (personId != null && reach.includes(personId));

// Leads assigned to someone this person reaches. A team manager does not see unassigned leads: those belong to the agency's pool.
export const leadsWhere = (reach: Reach): Prisma.LeadWhereInput => (reach === true ? {} : { assignedToId: { in: reach } });
