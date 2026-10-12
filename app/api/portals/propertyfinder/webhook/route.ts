import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getWebhookSecret } from "@/lib/propertyFinder/auth";
import { ingestPropertyFinderLead } from "@/lib/leads/ingest";
import { normalizePfLead, PfLeadLike } from "@/lib/leads/pfMapping";

function signatureOk(rawBody: string, signature: string | null, secret: string | null): boolean {
  // Lead events create data inside an agency, so an agency with no webhook secret
  // configured cannot receive them - otherwise anyone who knew an agent's public
  // Property Finder profile id could plant leads in that agency.
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// Property Finder calls this anonymously (no session) whenever a listing's
// state changes. Writes here are idempotent (we just set state from the
// payload), so at-least-once delivery (their own documented retry behavior)
// is safe without a separate dedupe table. Must respond within 5 seconds -
// the DB write below is fast enough to do inline rather than deferring it.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature");

  let event: {
    id?: string;
    type: string;
    timestamp?: string;
    entity: { id: string; type: string };
    payload?: { failureType?: string; reasons?: { en: string; ar: string }[] } & Omit<PfLeadLike, "id">;
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Lead events (lead.created / lead.updated / lead.assigned). The payload names the
  // Property Finder agent profile the lead went to; the agency that has that profile
  // linked to one of its users is the one whose webhook secret must match.
  if (event.entity?.type === "lead") {
    const profileId = event.payload?.publicProfile?.id;
    if (!profileId) return NextResponse.json({ ok: true });
    const agent = await prisma.user.findFirst({ where: { pfPublicProfileId: profileId }, select: { organizationId: true } });
    if (!agent) return NextResponse.json({ ok: true });
    const leadOrgId = agent.organizationId;
    if (!signatureOk(rawBody, signature, await getWebhookSecret(leadOrgId))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    const normalized = normalizePfLead({ ...event.payload, id: event.entity.id } as PfLeadLike);
    if (!normalized.receivedAt && event.timestamp) {
      const t = new Date(event.timestamp);
      if (!Number.isNaN(t.getTime())) normalized.receivedAt = t;
    }
    await ingestPropertyFinderLead(leadOrgId, normalized, event);
    return NextResponse.json({ ok: true });
  }

  if (event.entity?.type !== "listing") {
    return NextResponse.json({ ok: true });
  }

  // Several agencies share this one callback URL, each with its own Property
  // Finder account and webhook secret. The event names a Property Finder
  // listing id; whichever agency owns that listing is the one whose secret the
  // signature must match. (The unverified body is only used to pick which
  // secret to check against - nothing is written until the signature passes.)
  const owner = await prisma.portalListing.findFirst({
    where: { portal: "PROPERTY_FINDER", remoteListingId: event.entity.id },
    select: { listing: { select: { organizationId: true } } },
  });
  if (!owner) return NextResponse.json({ ok: true });
  const orgId = owner.listing.organizationId;
  const secret = await getWebhookSecret(orgId);

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

  const stateByEvent: Record<string, string> = {
    "listing.published": "live",
    "listing.unpublished": "unpublished",
  };

  if (event.type === "listing.publishFailed") {
    const reasons = event.payload?.reasons?.map((r) => r.en).join("; ") ?? event.payload?.failureType ?? "Publish failed";
    await prisma.portalListing.updateMany({
      where: { portal: "PROPERTY_FINDER", remoteListingId: event.entity.id, listing: { organizationId: orgId } },
      data: { state: "publishing_failed", lastError: reasons, lastSyncedAt: new Date() },
    });
  } else if (stateByEvent[event.type]) {
    await prisma.portalListing.updateMany({
      where: { portal: "PROPERTY_FINDER", remoteListingId: event.entity.id, listing: { organizationId: orgId } },
      data: { state: stateByEvent[event.type], enabled: event.type === "listing.published", lastError: null, lastSyncedAt: new Date() },
    });
  } else {
    // listing.action / listing.systemUpdated / anything else we don't
    // specifically react to yet - just record that we heard from PF.
    await prisma.portalListing.updateMany({
      where: { portal: "PROPERTY_FINDER", remoteListingId: event.entity.id, listing: { organizationId: orgId } },
      data: { lastSyncedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
