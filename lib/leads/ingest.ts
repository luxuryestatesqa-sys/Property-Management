import { tenantDb } from "@/lib/tenant";
import { firstStageId } from "./stages";
import { pickAgentByRules } from "./rules";
import { CHANNEL_LABELS, NormalizedLead, listingIdFromReference } from "./pfMapping";
import type { Prisma } from "@prisma/client";

export interface IngestResult {
  leadId: string;
  created: boolean;
}

const LISTING_SELECT = { id: true, area: true, community: true, createdById: true } as const;

// Stores one Property Finder lead for an agency. Idempotent: the same external id
// updates the existing row instead of creating a second one, so webhook retries,
// lead.updated events and the periodic sync can all call this freely.
//
// Never overwrites what people did in the app: the stage and the assigned agent
// are only set when the lead is created (or, for the agent, while still unassigned).
export async function ingestPropertyFinderLead(orgId: string, n: NormalizedLead, raw?: unknown): Promise<IngestResult> {
  const db = tenantDb(orgId);

  const existing = await db.lead.findFirst({ where: { source: "PROPERTY_FINDER", externalId: n.externalId } });

  // Which of our listings was it about?
  let listing: { id: number; area: string; community: string; createdById: string } | null = null;
  const refId = listingIdFromReference(n.listingReference);
  if (refId) listing = await db.listing.findFirst({ where: { id: refId }, select: LISTING_SELECT });
  if (!listing && n.pfListingId) {
    const portal = await db.portalListing.findFirst({ where: { portal: "PROPERTY_FINDER", remoteListingId: n.pfListingId }, select: { listingId: true } });
    if (portal) listing = await db.listing.findFirst({ where: { id: portal.listingId }, select: LISTING_SELECT });
  }

  const region = listing
    ? listing.community && listing.community !== listing.area
      ? `${listing.area} → ${listing.community}`
      : listing.area
    : typeof n.sellerProperty?.locationPath === "string"
      ? (n.sellerProperty.locationPath as string)
      : null;

  // Which agent should see it? The Property Finder profile it was sent to, mapped
  // to the user linked to that profile; failing that, whoever owns the listing.
  let assignedToId: string | null = null;
  let assignReason = "";
  // The agency's own rules come first (a manager steering a region or sharing the load).
  const ruleMatch = await pickAgentByRules(orgId, { region });
  if (ruleMatch) {
    assignedToId = ruleMatch.userId;
    assignReason = `Assigned by rule “${ruleMatch.ruleName}”`;
  }
  if (!assignedToId && n.pfPublicProfileId) {
    const user = await db.user.findFirst({ where: { pfPublicProfileId: n.pfPublicProfileId, status: "ACTIVE" }, select: { id: true } });
    if (user) {
      assignedToId = user.id;
      assignReason = "Matched to the agent linked to this Property Finder profile";
    }
  }
  if (!assignedToId && listing) {
    const owner = await db.user.findFirst({ where: { id: listing.createdById, status: "ACTIVE" }, select: { id: true } });
    if (owner) {
      assignedToId = owner.id;
      assignReason = "Assigned to the agent who owns the listing";
    }
  }

  const callFields = { callTalkTime: n.callTalkTime, callWaitTime: n.callWaitTime, callRecordUrl: n.callRecordUrl };

  if (existing) {
    const data: Prisma.LeadUncheckedUpdateInput = {
      ...(n.pfStatus ? { pfStatus: n.pfStatus } : {}),
      ...(n.responseLink ? { responseLink: n.responseLink } : {}),
      ...(n.callRecordUrl || n.callTalkTime !== null ? callFields : {}),
      ...(n.tags.length ? { tags: n.tags } : {}),
      ...(listing && !existing.listingId ? { listingId: listing.id, region } : {}),
      ...(n.phone && !existing.phone ? { phone: n.phone } : {}),
    };
    // A lead that arrived before its agent was linked gets picked up on a later update.
    if (!existing.assignedToId && assignedToId) data.assignedToId = assignedToId;
    // Property Finder reporting a reply is the agent's first response.
    if (n.pfStatus === "replied" && !existing.firstContactedAt) data.firstContactedAt = new Date();

    await db.lead.update({ where: { id: existing.id }, data });

    if (n.pfStatus && n.pfStatus !== existing.pfStatus) {
      await db.leadActivity.create({
        data: { organizationId: orgId, leadId: existing.id, type: "PF_STATUS", text: `Property Finder status: ${existing.pfStatus ?? "new"} → ${n.pfStatus}` },
      });
    }
    if (!existing.assignedToId && assignedToId) {
      await db.leadActivity.create({ data: { organizationId: orgId, leadId: existing.id, type: "ASSIGNED", text: assignReason, data: { toUserId: assignedToId } } });
    }
    return { leadId: existing.id, created: false };
  }

  const stageId = await firstStageId(orgId);
  const lead = await db.lead.create({
    data: {
      organizationId: orgId,
      source: "PROPERTY_FINDER",
      externalId: n.externalId,
      channel: n.channel,
      entityType: n.entityType,
      name: n.name,
      phone: n.phone,
      email: n.email,
      whatsappUsername: n.whatsappUsername,
      pfStatus: n.pfStatus,
      responseLink: n.responseLink,
      tags: n.tags,
      listingId: listing?.id ?? null,
      listingReference: n.listingReference,
      region,
      pfPublicProfileId: n.pfPublicProfileId,
      assignedToId,
      stageId,
      ...callFields,
      sellerProperty: (n.sellerProperty ?? undefined) as Prisma.InputJsonValue | undefined,
      raw: (raw ?? undefined) as Prisma.InputJsonValue | undefined,
      receivedAt: n.receivedAt ?? new Date(),
      firstContactedAt: n.pfStatus === "replied" ? new Date() : null,
    },
  });

  await db.leadActivity.create({
    data: {
      organizationId: orgId,
      leadId: lead.id,
      type: "RECEIVED",
      text: `Lead received from Property Finder via ${CHANNEL_LABELS[n.channel]}`,
      data: { channel: n.channel, listingReference: n.listingReference },
    },
  });
  if (assignedToId) {
    await db.leadActivity.create({ data: { organizationId: orgId, leadId: lead.id, type: "ASSIGNED", text: assignReason, data: { toUserId: assignedToId } } });
  } else {
    await db.leadActivity.create({ data: { organizationId: orgId, leadId: lead.id, type: "UNASSIGNED", text: "No matching agent found - waiting in the Unassigned inbox" } });
  }
  return { leadId: lead.id, created: true };
}
