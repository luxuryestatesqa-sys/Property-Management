import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    return { session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.status !== "ACTIVE") {
    return { session: null, error: NextResponse.json({ error: "Account inactive" }, { status: 403 }) };
  }
  return { session, error: null };
}

export async function requireAdmin() {
  const { session, error } = await requireSession();
  if (error) return { session: null, error };
  if (session!.user.role !== "ADMIN") {
    return { session: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, error: null };
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
