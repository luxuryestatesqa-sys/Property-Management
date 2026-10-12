import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { tenantDb } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

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
  // agency, or a changed role takes effect immediately, not when the token expires.
  const live = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { status: true, role: true, organizationId: true, organization: { select: { status: true } } },
  });
  if (!live || live.organizationId !== session.user.organizationId) {
    return { session: null, db: null, orgId: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (live.status !== "ACTIVE" || live.organization.status !== "ACTIVE") {
    return { session: null, db: null, orgId: null, error: NextResponse.json({ error: "Account inactive" }, { status: 403 }) };
  }
  session.user.role = live.role as typeof session.user.role;
  const orgId = live.organizationId;
  return { session, db: tenantDb(orgId), orgId, error: null };
}

export async function requireAdmin() {
  const { session, db, orgId, error } = await requireSession();
  if (error) return { session: null, db: null, orgId: null, error };
  if (!isAdminRole(session!.user.role)) {
    return { session: null, db: null, orgId: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, db, orgId, error: null };
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
