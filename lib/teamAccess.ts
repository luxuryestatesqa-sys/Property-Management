import { prisma } from "@/lib/prisma";
import { effectivePermissions, normalizePermissions, type Permission } from "@/lib/permissions";
import { TEAM_MANAGER_PERMISSIONS } from "@/lib/teamManagerPermissions";

// When a Manager is put in charge of a team, give them any of the permissions above they are missing. Nothing is
// ever taken away, and the Super Admin can still change them under Permissions. Returns what was added.
export async function grantTeamManagerPermissions(userId: string): Promise<Permission[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, permissions: true, organization: { select: { rolePermissions: true } } } });
  if (!user || user.role !== "MANAGER") return [];
  const have = effectivePermissions(user.role, user.permissions, user.organization.rolePermissions as never);
  const missing = TEAM_MANAGER_PERMISSIONS.filter((p) => !have.includes(p));
  if (missing.length === 0) return [];
  await prisma.user.update({ where: { id: userId }, data: { permissions: normalizePermissions([...have, ...missing]) } });
  return missing;
}
