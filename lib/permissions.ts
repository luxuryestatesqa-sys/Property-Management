import type { Role } from "./types";

// What a person may do is a set of permissions. The Super Admin (the Owner, the one who created the agency)
// always has all of them. Everyone else - Admin, Manager, Agent - gets the set saved on their account; if none
// is saved they follow their role's template, which the Super Admin can change (Organization.rolePermissions)
// and which starts from DEFAULT_PERMISSIONS.
// This file has no server imports so the browser can use it to show or hide buttons; the API routes are
// the real check.

export type PermissionGroup = { title: string; items: { key: string; label: string; hint: string }[] };

export const PERMISSION_GROUPS = [
  {
    title: "Dashboard and reports",
    items: [
      { key: "dashboard.view", label: "Agency dashboard", hint: "Open the dashboard with the whole agency's numbers" },
      { key: "activities.viewAll", label: "Everyone's activities", hint: "See what every agent did, and export it. Without this, only their own" },
    ],
  },
  {
    title: "Leads",
    items: [
      { key: "leads.viewAll", label: "All leads", hint: "See and work on every lead in the agency. Without this, only leads assigned to them" },
      { key: "leads.assign", label: "Assign leads", hint: "Assign, reassign, merge and group leads, and import with an assignee" },
      { key: "leads.delete", label: "Delete leads", hint: "Delete leads permanently" },
      { key: "leads.stages", label: "Lead stages", hint: "Add, rename and remove lead stages" },
      { key: "leads.rules", label: "Assignment rules", hint: "Create and change the rules that assign new leads" },
    ],
  },
  {
    title: "Listings",
    items: [
      { key: "listings.viewAll", label: "All listings", hint: "See other agents' private listings and their owner details" },
      { key: "listings.editAll", label: "Edit all listings", hint: "Edit, publish, hide and delete other agents' listings" },
    ],
  },
  {
    title: "Viewings and owners",
    items: [
      { key: "viewings.manageAll", label: "All viewings", hint: "See every viewing and book one for another agent" },
      { key: "owners.viewAll", label: "All owners", hint: "See every property owner, not only their own" },
    ],
  },
  {
    title: "Team and settings",
    items: [
      { key: "users.manage", label: "Manage users", hint: "Add people, change their details and permissions, deactivate them. Cannot touch Super Admins" },
      { key: "teams.manage", label: "Teams", hint: "Create teams, choose each team's manager and who is in it" },
      { key: "settings.agency", label: "Agency profile", hint: "Change the agency name, logo and colour" },
      { key: "settings.integrations", label: "Portals and integrations", hint: "Property Finder, Qatar Living, Oryx, Meta, feeds and AI settings" },
    ],
  },
] as const satisfies readonly PermissionGroup[];

export type Permission = (typeof PERMISSION_GROUPS)[number]["items"][number]["key"];
export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));
const KNOWN = new Set<string>(ALL_PERMISSIONS);

// Having the first permission only makes sense with the second, so the first brings the second with it.
const IMPLIES: Partial<Record<Permission, Permission[]>> = {
  "leads.assign": ["leads.viewAll"],
  "leads.delete": ["leads.viewAll"],
  "leads.stages": ["leads.viewAll"],
  "leads.rules": ["leads.viewAll"],
  "listings.editAll": ["listings.viewAll"],
  "users.manage": [],
};

// Same as what Managers and Agents could do before permissions were configurable.
export type TemplateRole = "ADMIN" | "MANAGER" | "AGENT";
export const DEFAULT_PERMISSIONS: Record<TemplateRole, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  MANAGER: ["dashboard.view", "activities.viewAll", "leads.viewAll", "leads.assign", "viewings.manageAll", "owners.viewAll"],
  AGENT: [],
};

// Only the Owner is the Super Admin. Admins are created by the Super Admin and have the permissions given to them.
export const isSuperAdminRole = (role: Role | string | null | undefined) => role === "OWNER";

export function normalizePermissions(input: unknown): Permission[] {
  if (!Array.isArray(input)) return [];
  const set = new Set<Permission>();
  for (const p of input) if (typeof p === "string" && KNOWN.has(p)) set.add(p as Permission);
  for (const p of [...set]) for (const implied of IMPLIES[p] ?? []) set.add(implied);
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

export type RoleTemplates = Partial<Record<TemplateRole, unknown>> | null | undefined;

export function templateFor(role: TemplateRole, templates: RoleTemplates): Permission[] {
  const saved = templates?.[role];
  return Array.isArray(saved) ? normalizePermissions(saved) : DEFAULT_PERMISSIONS[role];
}

// The permissions a person has right now. `own` is what is saved on their account (null = follow the template).
export function effectivePermissions(role: Role | string, own: unknown, templates: RoleTemplates): Permission[] {
  if (isSuperAdminRole(role)) return ALL_PERMISSIONS;
  if (Array.isArray(own)) return normalizePermissions(own);
  return templateFor(role === "ADMIN" ? "ADMIN" : role === "MANAGER" ? "MANAGER" : "AGENT", templates);
}

export function can(user: { role?: string | null; permissions?: readonly string[] | null } | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  if (isSuperAdminRole(user.role)) return true;
  return Boolean(user.permissions?.includes(permission));
}
