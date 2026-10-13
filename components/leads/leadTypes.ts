export type LeadChannel = "WHATSAPP" | "CALL" | "EMAIL" | "OTHER" | "FORM";

export interface LeadStageDTO {
  id: string;
  name: string;
  kind: "OPEN" | "WON" | "LOST";
  color: string | null;
  position: number;
}

export interface LeadRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  channel: LeadChannel;
  sourceLabel: string | null;
  duplicates: number; // other leads with the same phone or email
  source: "PROPERTY_FINDER" | "META" | "MANUAL" | "IMPORT";
  pfStatus: string | null;
  region: string | null;
  listing: { id: number; buildingName: string } | null;
  listingReference: string | null;
  stageId: string;
  assignedTo: { id: string; name: string; avatarUrl: string | null } | null;
  receivedAt: string;
  callTalkTime: number | null;
  hasRecording: boolean;
  tags: string[];
  entityType: string | null;
  groups: LeadGroupDTO[];
  nextFollowUp: string | null;
}

export interface LeadGroupDTO {
  id: string;
  name: string;
  color: string | null;
}

export interface LeadsResponse {
  leads: LeadRow[];
  total: number;
  nextCursor?: string | null;
  stages: LeadStageDTO[];
  agents: { id: string; name: string; avatarUrl: string | null }[];
  agentCounts: { assignedToId: string | null; count: number }[];
  followups: { today: number; overdue: number };
  countGrid: { assignedToId: string | null; stageId: string; count: number }[];
  newCount: number;
  canManage: boolean;
}

export const SOURCE_LABELS: Record<LeadRow["source"], string> = {
  PROPERTY_FINDER: "Property Finder",
  META: "Facebook / Instagram",
  MANUAL: "Manual",
  IMPORT: "Import",
};

export const CHANNEL_LABELS: Record<LeadChannel, string> = { WHATSAPP: "WhatsApp", CALL: "Call", EMAIL: "Email", OTHER: "Other", FORM: "Lead form" };
