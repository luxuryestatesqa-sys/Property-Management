import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { Portal } from "@prisma/client";
import { FEED_SLUGS } from "@/lib/feeds/generateFeed";

const FEED_PORTALS = new Set<string>(Object.values(FEED_SLUGS).map((e) => e.portal));

// Regenerating immediately invalidates every previously-copied feed link for
// this portal (old token no longer matches) - the settings page warns about
// this before calling it.
export async function POST(_req: Request, { params }: { params: Promise<{ portal: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { portal } = await params;
  if (!FEED_PORTALS.has(portal)) {
    return NextResponse.json({ error: "This portal doesn't have a feed" }, { status: 400 });
  }

  const feedToken = randomBytes(24).toString("hex");
  const credential = await prisma.portalCredential.upsert({
    where: { portal: portal as Portal },
    update: { feedToken },
    create: { portal: portal as Portal, feedToken },
  });

  return NextResponse.json({ feedToken: credential.feedToken, feedAgencyId: credential.feedAgencyId });
}
