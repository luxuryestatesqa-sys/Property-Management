import type { Permission } from "@/lib/permissions";

// What someone needs to run a team: see its dashboard, leads, listings, viewings and owners, assign within it.
// Because a team manager's reach is limited to their team (lib/scope.ts), these cannot be used outside it.
export const TEAM_MANAGER_PERMISSIONS: Permission[] = [
  "dashboard.view",
  "activities.viewAll",
  "leads.viewAll",
  "leads.assign",
  "listings.viewAll",
  "listings.editAll",
  "viewings.manageAll",
  "owners.viewAll",
];
