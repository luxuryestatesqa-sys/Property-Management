import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { listWebhooks, subscribeWebhook, describePropertyFinderError } from "@/lib/propertyFinder/client";
import { getAppBaseUrl } from "@/lib/propertyFinder/sync";

// The events this app needs to keep PortalListing.state current.
const REQUIRED_EVENTS = ["listing.published", "listing.unpublished", "listing.publishFailed", "listing.action", "listing.systemUpdated"];

// One-time setup, not something that runs per listing: registers this app's
// webhook callback URL with Property Finder for each event type it needs.
// Property Finder allows multiple subscriptions to the same event (each
// delivers separately), so this checks existing subscriptions first to
// avoid creating duplicates on repeat calls.
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const webhooks = await listWebhooks();
    const callbackUrl = `${getAppBaseUrl()}/api/portals/propertyfinder/webhook`;
    const subscribed = new Set(webhooks.filter((w) => w.url === callbackUrl).map((w) => w.eventId));
    return NextResponse.json({
      callbackUrl,
      missing: REQUIRED_EVENTS.filter((e) => !subscribed.has(e)),
      subscribed: REQUIRED_EVENTS.filter((e) => subscribed.has(e)),
    });
  } catch (err) {
    return NextResponse.json({ error: describePropertyFinderError(err) }, { status: 502 });
  }
}

export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    // A webhook secret is required to verify deliveries actually came from
    // Property Finder (see the receiver route) - generate one automatically
    // if the admin hasn't set one yet, rather than blocking setup on it.
    let credential = await prisma.portalCredential.findUnique({ where: { portal: "PROPERTY_FINDER" } });
    if (!credential?.webhookSecret) {
      const webhookSecret = crypto.randomBytes(24).toString("hex");
      credential = await prisma.portalCredential.upsert({
        where: { portal: "PROPERTY_FINDER" },
        update: { webhookSecret },
        create: { portal: "PROPERTY_FINDER", webhookSecret },
      });
    }

    const webhooks = await listWebhooks();
    const callbackUrl = `${getAppBaseUrl()}/api/portals/propertyfinder/webhook`;
    const subscribed = new Set(webhooks.filter((w) => w.url === callbackUrl).map((w) => w.eventId));
    const toCreate = REQUIRED_EVENTS.filter((e) => !subscribed.has(e));

    for (const eventId of toCreate) {
      await subscribeWebhook(eventId, callbackUrl, credential.webhookSecret!);
    }

    return NextResponse.json({ created: toCreate });
  } catch (err) {
    return NextResponse.json({ error: describePropertyFinderError(err) }, { status: 502 });
  }
}
