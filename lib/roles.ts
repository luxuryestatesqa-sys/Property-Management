import type { Role } from "./types";

// OWNER created the agency; ADMIN runs it day to day. Both have full access to
// the agency's data, settings and users. (Existing accounts that were "ADMIN"
// before multi-agency keep working unchanged.)
export function isAdminRole(role: Role | string | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

// Can see every lead/listing in the agency and assign work to others.
export function isManagerRole(role: Role | string | null | undefined): boolean {
  return isAdminRole(role) || role === "MANAGER";
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Super Admin",
  ADMIN: "Admin",
  MANAGER: "Manager",
  AGENT: "Agent",
};
