import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { tenantDb } from "@/lib/tenant";
import { loadLiveUser } from "@/lib/liveUser";
import { can, type Permission } from "@/lib/permissions";

// Every authenticated route starts here. Besides the session it returns `db`,
// a database client locked to the caller's agency (see lib/tenant.ts) - use it
// instead of the global `prisma` for anything an agency owns, so one agency can
// never read or change another's data.
export async function requireSession() {
  const session = await auth();
  if (!session?.user || !session.user.organizationId) {
    return { session: null, db: null, orgId: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  // The signed-in token can outlive the account it was issued for, so every request
  // is checked against the database: a removed or deactivated user, a suspended
  // agency, or changed permissions take effect within seconds, not when the token expires.
  const live = await loadLiveUser(session.user.id);
  if (!live || live.organizationId !== session.user.organizationId) {
    return { session: null, db: null, orgId: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (live.status !== "ACTIVE" || live.orgStatus !== "ACTIVE") {
    return { session: null, db: null, orgId: null, error: NextResponse.json({ error: "Account inactive" }, { status: 403 }) };
  }
  session.user.role = live.role as typeof session.user.role;
  session.user.permissions = live.permissions;
  const orgId = live.organizationId;
  return { session, db: tenantDb(orgId), orgId, error: null };
}

// Requires one permission (Owners and Super Admins have them all).
export async function requirePermission(permission: Permission) {
  const result = await requireSession();
  if (result.error) return result;
  if (!can(result.session!.user, permission)) {
    return { session: null, db: null, orgId: null, error: NextResponse.json({ error: "You don't have permission to do this" }, { status: 403 }) };
  }
  return result;
}

// req.json() throws on a body that isn't valid JSON - which happens for any
// genuinely malformed request, but also for one truncated by proxy.ts's
// request-body buffer limit (experimental.proxyClientMaxBodySize in
// next.config.ts) before a route ever sees it, e.g. a listing submitted with
// enough full-size photos to push the JSON payload past that limit. Left
// unhandled, that throw crashes the route with an empty response instead of
// a message the UI can show - this turns it into a normal 400 the client's
// existing "not res.ok" handling already knows how to display.
export async function parseJsonBody<T = unknown>(req: NextRequest): Promise<{ value: T | null; error: NextResponse | null }> {
  try {
    return { value: (await req.json()) as T, error: null };
  } catch {
    return {
      value: null,
      error: NextResponse.json(
        { error: "Couldn't read the request - it may be too large (e.g. too many/too-large photos). Try removing a photo and submitting again." },
        { status: 400 }
      ),
    };
  }
}
