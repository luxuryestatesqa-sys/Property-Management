import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { Portal } from "@prisma/client";
import { clearCachedToken } from "@/lib/propertyFinder/auth";

// Generic credential storage for any portal in the Portal enum - the
// key/secret/webhook-secret shape covers every portal this app has needed so
// far, so adding a second portal here is just a new enum value, not a new
// route. Portal-specific behavior (like Property Finder's own "test
// connection" call, which needs to know what a healthy response looks like)
// stays in that portal's own route, e.g. app/api/admin/portals/propertyfinder/test.
const VALID_PORTALS = new Set<string>(Object.values(Portal));

// Never sent back to the client in full - the last 4 characters are enough
// for an admin to recognize "yes, that's the key I pasted" without this
// endpoint ever round-tripping the real secret.
function mask(value: string | null): string | null {
  if (!value) return null;
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ portal: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { portal } = await params;
  if (!VALID_PORTALS.has(portal)) {
    return NextResponse.json({ error: "Unknown portal" }, { status: 404 });
  }

  const credential = await prisma.portalCredential.findUnique({ where: { portal: portal as Portal } });
  return NextResponse.json({
    configured: Boolean(credential?.apiKey && credential?.apiSecret),
    apiKeyPreview: mask(credential?.apiKey ?? null),
    apiSecretPreview: mask(credential?.apiSecret ?? null),
    webhookSecretConfigured: Boolean(credential?.webhookSecret),
    updatedAt: credential?.updatedAt ?? null,
    // Unlike apiKey/apiSecret above (real API credentials, never
    // round-tripped in full), the feed token is a capability URL an admin
    // needs to hand to a portal and copy again later - like a calendar app's
    // "secret iCal address," it's returned in full here rather than masked.
    feedAgencyId: credential?.feedAgencyId ?? null,
    feedToken: credential?.feedToken ?? null,
  });
}

// Admin-only. Only overwrites fields actually provided (non-empty strings),
// so re-saving one field doesn't require retyping the others - the client
// never has the real values to send back anyway, since GET only returns
// masked previews.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ portal: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { portal } = await params;
  if (!VALID_PORTALS.has(portal)) {
    return NextResponse.json({ error: "Unknown portal" }, { status: 404 });
  }

  const body = await req.json();
  const data: Record<string, string> = {};
  for (const field of ["apiKey", "apiSecret", "webhookSecret", "feedAgencyId"] as const) {
    if (typeof body[field] === "string" && body[field].trim() !== "") {
      data[field] = body[field].trim();
    }
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await prisma.portalCredential.upsert({
    where: { portal: portal as Portal },
    update: data,
    create: { portal: portal as Portal, ...data },
  });

  // Force the next request to fetch a fresh token under the new credentials,
  // rather than waiting for the old one to expire. Only Property Finder has
  // a cached-token auth module today; a future portal with its own would get
  // its own cache cleared here too.
  if (portal === "PROPERTY_FINDER") clearCachedToken();

  return NextResponse.json({ ok: true });
}
