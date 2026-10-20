// The numbers on a team's page: who is in it and what each person has, with totals for the whole team.
// (Types are shared with the screen; the loader runs on the server.)

export interface TeamNumbers {
  listings: { total: number; active: number; rent: number; sale: number };
  leads: { total: number; open: number; won: number; lost: number; new30: number };
  viewingsWeek: number;
}

export interface TeamMemberStats extends TeamNumbers {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  status: string;
  // The person in charge of the team (they are counted in the numbers, whether or not they are listed as a member).
  isManager: boolean;
  // Whether they are listed as a member (the manager may only be in charge of the team, not a member of it).
  inTeam: boolean;
}

export interface TeamDetail {
  team: { id: string; name: string; manager: { id: string; name: string } | null };
  // Whether this person may add and remove people (the Teams permission); the team's manager can only look.
  canEdit: boolean;
  members: TeamMemberStats[];
  totals: TeamNumbers & { people: number; activePeople: number };
  // People who could be added: not in this team yet, with the team they are in now.
  candidates: { id: string; name: string; role: string; avatarUrl: string | null; team: string | null }[];
}

export const emptyNumbers = (): TeamNumbers => ({ listings: { total: 0, active: 0, rent: 0, sale: 0 }, leads: { total: 0, open: 0, won: 0, lost: 0, new30: 0 }, viewingsWeek: 0 });

export function addNumbers(a: TeamNumbers, b: TeamNumbers): TeamNumbers {
  return {
    listings: { total: a.listings.total + b.listings.total, active: a.listings.active + b.listings.active, rent: a.listings.rent + b.listings.rent, sale: a.listings.sale + b.listings.sale },
    leads: { total: a.leads.total + b.leads.total, open: a.leads.open + b.leads.open, won: a.leads.won + b.leads.won, lost: a.leads.lost + b.leads.lost, new30: a.leads.new30 + b.leads.new30 },
    viewingsWeek: a.viewingsWeek + b.viewingsWeek,
  };
}
