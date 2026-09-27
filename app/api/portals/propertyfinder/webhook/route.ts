import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getWebhookSecret } from "@/lib/propertyFinder/auth";

// Property Finder calls this anonymously (no session) whenever a listing's
// state changes. Writes here are idempotent (we just set state from the
// payload), so at-least-once delivery (their own documented retry behavior)
// is safe without a separate dedupe table. Must respond within 5 seconds -
// the DB write below is fast enough to do inline rather than deferring it.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature");
  const secret = await getWebhookSecret();

  if (secret) {
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const valid =
      expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const event = JSON.parse(rawBody) as {
    type: string;
    entity: { id: string; type: string };
    payload?: { failureType?: string; reasons?: { en: string; ar: string }[] };
  };

  if (event.entity?.type !== "listing") {
    return NextResponse.json({ ok: true });
  }

  const stateByEvent: Record<string, string> = {
    "listing.published": "live",
    "listing.unpublished": "unpublished",
  };

  if (event.type === "listing.publishFailed") {
    const reasons = event.payload?.reasons?.map((r) => r.en).join("; ") ?? event.payload?.failureType ?? "Publish failed";
    await prisma.portalListing.updateMany({
      where: { portal: "PROPERTY_FINDER", remoteListingId: event.entity.id },
      data: { state: "publishing_failed", lastError: reasons, lastSyncedAt: new Date() },
    });
  } else if (stateByEvent[event.type]) {
    await prisma.portalListing.updateMany({
      where: { portal: "PROPERTY_FINDER", remoteListingId: event.entity.id },
      data: { state: stateByEvent[event.type], lastError: null, lastSyncedAt: new Date() },
    });
  } else {
    // listing.action / listing.systemUpdated / anything else we don't
    // specifically react to yet - just record that we heard from PF.
    await prisma.portalListing.updateMany({
      where: { portal: "PROPERTY_FINDER", remoteListingId: event.entity.id },
      data: { lastSyncedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
