import { NextResponse, type NextRequest } from "next/server";
import { can, effectivePermissions, type Permission } from "../permissions";

// A stand-in for lib/api-helpers in the database tests: the real one needs next-auth, which can't load under
// vitest. The fake session carries the permissions its role would have (Owner everything, Admin everything by
// default, Manager and Agent their defaults), exactly as the real requireSession would give them.
export function fakeApiHelpers(get: () => { session: { user: { id: string; role: string } } | null; orgId: string }, tenantDb: (orgId: string) => unknown) {
  const ctx = () => {
    const { session, orgId } = get();
    const user = session?.user;
    const full = user && { user: { ...user, organizationId: orgId, status: "ACTIVE", permissions: effectivePermissions(user.role, null, null), teamScoped: false } };
    return { session: full as never, db: tenantDb(orgId) as never, orgId, scope: null as string[] | null, error: null };
  };
  const forbidden = () => ({ session: null, db: null, orgId: null, scope: null as string[] | null, error: NextResponse.json({ error: "You don't have permission to do this" }, { status: 403 }) });
  return {
    requireSession: async () => ctx(),
    requirePermission: async (permission: Permission) => {
      const c = ctx();
      return can((c.session as { user: { role: string; permissions: string[] } } | undefined)?.user, permission) ? c : forbidden();
    },
    parseJsonBody: async (req: NextRequest) => ({ value: await req.json().catch(() => ({})), error: null }),
  };
}
