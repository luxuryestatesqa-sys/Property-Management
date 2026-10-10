import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

// Qatar Living's feed API spec allows Bearer token, a static API key header,
// or Basic auth - this app uses the static API key form (`X-API-Key`),
// checked against PortalCredential.QATAR_LIVING.feedToken (the same secret
// field the other portals' pull feeds use for their URL token, just read
// from a header here instead of a query string per QL's own auth model).
// Returns the agency the key belongs to, or a 401 response.
export async function requireQatarLivingAuth(req: NextRequest): Promise<{ orgId: string } | NextResponse> {
  const provided = req.headers.get("x-api-key") ?? "";
  const credential = provided ? await prisma.portalCredential.findFirst({ where: { portal: "QATAR_LIVING", feedToken: provided } }) : null;

  if (!credential?.feedToken || !safeEqual(provided, credential.feedToken)) {
    return NextResponse.json({ error: "Invalid or missing X-API-Key" }, { status: 401 });
  }
  return { orgId: credential.organizationId };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
