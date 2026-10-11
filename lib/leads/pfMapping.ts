import type { LeadChannel } from "@prisma/client";

// Property Finder's lead, as returned by GET /v1/leads and (a subset) inside
// lead.* webhook payloads. Only the fields this app reads.
export interface PfContact {
  type: "email" | "phone" | "whatsappUsername" | string;
  value: string;
}

export interface PfLeadLike {
  id: string;
  entityType?: string;
  channel?: string;
  status?: string;
  publicProfile?: { id: number };
  sender?: { name?: string; contacts?: PfContact[] };
  responseLink?: string | null;
  listing?: { id: string; reference?: string };
  call?: { talkTime?: number; waitTime?: number; recordFile?: string };
  tags?: string[];
  sellerProperty?: { locationPath?: string } & Record<string, unknown>;
  createdAt?: string;
}

export interface NormalizedLead {
  externalId: string;
  channel: LeadChannel;
  entityType: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  whatsappUsername: string | null;
  pfStatus: string | null;
  responseLink: string | null;
  tags: string[];
  listingReference: string | null;
  pfListingId: string | null;
  pfPublicProfileId: number | null;
  callTalkTime: number | null;
  callWaitTime: number | null;
  callRecordUrl: string | null;
  sellerProperty: Record<string, unknown> | null;
  // null when the source does not say (webhook payloads omit it)
  receivedAt: Date | null;
}

const CHANNELS: Record<string, LeadChannel> = { whatsapp: "WHATSAPP", call: "CALL", email: "EMAIL" };

export function channelOf(value: string | undefined): LeadChannel {
  return (value && CHANNELS[value.toLowerCase()]) || "OTHER";
}

export function normalizePfLead(l: PfLeadLike): NormalizedLead {
  const contacts = l.sender?.contacts ?? [];
  const pick = (t: string) => contacts.find((c) => c.type === t)?.value?.trim() || null;
  const phone = pick("phone");
  const email = pick("email");
  const created = l.createdAt ? new Date(l.createdAt) : null;
  return {
    externalId: l.id,
    channel: channelOf(l.channel),
    entityType: l.entityType ?? null,
    name: l.sender?.name?.trim() || phone || email || "Unknown contact",
    phone,
    email,
    whatsappUsername: pick("whatsappUsername"),
    pfStatus: l.status ?? null,
    responseLink: l.responseLink ?? null,
    tags: l.tags ?? [],
    listingReference: l.listing?.reference ?? null,
    pfListingId: l.listing?.id ?? null,
    pfPublicProfileId: l.publicProfile?.id ?? null,
    callTalkTime: l.call?.talkTime ?? null,
    callWaitTime: l.call?.waitTime ?? null,
    callRecordUrl: l.call?.recordFile ?? null,
    sellerProperty: (l.sellerProperty as Record<string, unknown> | undefined) ?? null,
    receivedAt: created && !Number.isNaN(created.getTime()) ? created : null,
  };
}

// This app publishes listings with reference "LE-<listing id>" (see
// lib/propertyFinder/sync.ts), so a lead's reference points straight back at it.
export function listingIdFromReference(reference: string | null | undefined): number | null {
  const m = /^LE-(\d+)$/.exec(reference ?? "");
  return m ? Number(m[1]) : null;
}

export const CHANNEL_LABELS: Record<LeadChannel, string> = { WHATSAPP: "WhatsApp", CALL: "Phone call", EMAIL: "Email", OTHER: "Other", FORM: "Lead form" };
