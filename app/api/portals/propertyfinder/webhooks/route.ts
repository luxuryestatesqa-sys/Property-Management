import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/api-helpers";
import { listWebhooks, subscribeWebhook, describePropertyFinderError } from "@/lib/propertyFinder/client";
import { getAppBaseUrl } from "@/lib/propertyFinder/sync";

// The events this app needs to keep PortalListing.state current.
const REQUIRED_EVENTS = ["listing.published", "listing.unpublished", "listing.publishFailed", "listing.action", "listing.systemUpdated"];
// Lead events need the API key to have the `leads:read` scope, so they are subscribed
// separately and a missing scope never breaks the listing webhooks above.
const LEAD_EVENTS = ["lead.created", "lead.updated", "lead.assigned"];

// One-time setup, not something that runs per listing: registers this app's
// webhook callback URL with Property Finder for each event type it needs.
// Property Finder allows multiple subscriptions to the same event (each
// delivers separately), so this checks existing subscriptions first to
// avoid creating duplicates on repeat calls.
export async function GET() {
  const { orgId, error } = await requireAdmin();
  if (error) return error;
  // On a local or private address Property Finder can't call us back: say so plainly, not as a failure.
  try {
    getAppBaseUrl();
  } catch {
    return NextResponse.json({ localOnly: true, missing: [], subscribed: [] });
  }
  try {
    const webhooks = await listWebhooks(orgId!);
    const callbackUrl = `${getAppBaseUrl()}/api/portals/propertyfinder/webhook`;
    const subscribed = new Set(webhooks.filter((w) => w.url === callbackUrl).map((w) => w.eventId));
    return NextResponse.json({
      callbackUrl,
      missing: REQUIRED_EVENTS.filter((e) => !subscribed.has(e)),
      subscribed: REQUIRED_EVENTS.filter((e) => subscribed.has(e)),
      leadsSubscribed: LEAD_EVENTS.every((e) => subscribed.has(e)),
    });
  } catch (err) {
    return NextResponse.json({ error: describePropertyFinderError(err) }, { status: 502 });
  }
}

export async function POST() {
  const { db, orgId, error } = await requireAdmin();
  if (error) return error;

  try {
    // A webhook secret is required to verify deliveries actually came from
    // Property Finder (see the receiver route) - generate one automatically
    // if the admin hasn't set one yet, rather than blocking setup on it.
    let credential = await db!.portalCredential.findFirst({ where: { portal: "PROPERTY_FINDER" } });
    if (!credential?.webhookSecret) {
      const webhookSecret = crypto.randomBytes(24).toString("hex");
      credential = await db!.portalCredential.upsert({
        where: { organizationId_portal: { organizationId: orgId!, portal: "PROPERTY_FINDER" } },
        update: { webhookSecret },
        create: { organizationId: orgId!, portal: "PROPERTY_FINDER", webhookSecret },
      });
    }

    const webhooks = await listWebhooks(orgId!);
    const callbackUrl = `${getAppBaseUrl()}/api/portals/propertyfinder/webhook`;
    const subscribed = new Set(webhooks.filter((w) => w.url === callbackUrl).map((w) => w.eventId));
    const toCreate = REQUIRED_EVENTS.filter((e) => !subscribed.has(e));

    for (const eventId of toCreate) {
      await subscribeWebhook(orgId!, eventId, callbackUrl, credential.webhookSecret!);
    }

    // Lead events: best effort. A key without leads:read is refused by Property Finder.
    let leadsError: string | null = null;
    const leadsToCreate = LEAD_EVENTS.filter((e) => !subscribed.has(e));
    try {
      for (const eventId of leadsToCreate) await subscribeWebhook(orgId!, eventId, callbackUrl, credential.webhookSecret!);
    } catch (err) {
      leadsError = describePropertyFinderError(err);
    }

    return NextResponse.json({ created: toCreate, leadsCreated: leadsError ? [] : leadsToCreate, leadsError });
  } catch (err) {
    return NextResponse.json({ error: describePropertyFinderError(err) }, { status: 502 });
  }
}
