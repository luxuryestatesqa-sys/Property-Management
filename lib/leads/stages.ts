import { prisma } from "@/lib/prisma";
import type { LeadStageKind } from "@prisma/client";
import type { tenantDb } from "@/lib/tenant";

export const DEFAULT_STAGES: { name: string; kind: LeadStageKind; color: string }[] = [
  { name: "New", kind: "OPEN", color: "#3b82f6" },
  { name: "Contacted", kind: "OPEN", color: "#06b6d4" },
  { name: "Viewing", kind: "OPEN", color: "#f59e0b" },
  { name: "Negotiation", kind: "OPEN", color: "#8b5cf6" },
  { name: "Won", kind: "WON", color: "#16a34a" },
  { name: "Lost", kind: "LOST", color: "#f43f5e" },
];

// Every agency gets the standard pipeline the first time it needs one. Safe to
// call repeatedly (and concurrently): the (organization, name) unique index makes
// each insert a no-op once it exists.
export async function ensureStages(organizationId: string) {
  const existing = await prisma.leadStage.findMany({ where: { organizationId }, orderBy: { position: "asc" } });
  if (existing.length > 0) return existing;
  await prisma.leadStage.createMany({
    data: DEFAULT_STAGES.map((s, position) => ({ organizationId, position, ...s })),
    skipDuplicates: true,
  });
  return prisma.leadStage.findMany({ where: { organizationId }, orderBy: { position: "asc" } });
}

// Stage colours in the app follow the theme, not whatever colour was stored on the stage:
// the first open stage (New) is the cobalt accent, other open stages are quiet neutral, Won is the
// success green and Lost the danger red. Used by every API that sends stages to the screen.
export function stageThemeColor(kind: LeadStageKind, isFirstOpen: boolean): string {
  if (kind === "WON") return "var(--success)";
  if (kind === "LOST") return "var(--danger)";
  return isFirstOpen ? "var(--primary)" : "var(--text-muted)";
}

export function themedStages<T extends { id: string; kind: LeadStageKind }>(stages: T[]): (T & { color: string })[] {
  const firstOpen = stages.find((s) => s.kind === "OPEN")?.id;
  return stages.map((s) => ({ ...s, color: stageThemeColor(s.kind, s.id === firstOpen) }));
}

// The stage a brand-new lead starts in: the first OPEN stage.
export async function firstStageId(organizationId: string): Promise<string> {
  const stages = await ensureStages(organizationId);
  return (stages.find((s) => s.kind === "OPEN") ?? stages[0]).id;
}

// The stage a lead moves to on first contact: the one called "Contacted", else the next open stage after
// the starting one. Null when the agency has no such stage.
export function contactedStageFor<T extends { id: string; name: string; kind: LeadStageKind; position: number }>(stages: T[]): T | null {
  const open = stages.filter((s) => s.kind === "OPEN").sort((a, b) => a.position - b.position);
  return open.find((s) => s.name.trim().toLowerCase() === "contacted") ?? open[1] ?? null;
}

// The first outbound WhatsApp, call or note on a lead that is still in the starting stage ("New") moves it to
// "Contacted", records the first response time, and writes the move to the lead's timeline (and so to the
// activity log). Returns true when it moved the lead. Safe to call on every outbound action.
export async function advanceOnFirstContact(db: ReturnType<typeof tenantDb>, orgId: string, lead: { id: string; stageId: string; firstContactedAt: Date | null }, userId: string | null, at: Date = new Date()): Promise<boolean> {
  const stages = await db.leadStage.findMany({ orderBy: { position: "asc" } });
  const first = stages.find((s) => s.kind === "OPEN");
  if (!lead.firstContactedAt) await db.lead.update({ where: { id: lead.id }, data: { firstContactedAt: at } });
  if (!first || lead.stageId !== first.id) return false;
  const next = contactedStageFor(stages);
  if (!next || next.id === first.id) return false;
  await db.lead.update({ where: { id: lead.id }, data: { stageId: next.id } });
  await db.leadActivity.create({ data: { organizationId: orgId, leadId: lead.id, userId, type: "STAGE_CHANGED", text: `Stage: ${first.name} → ${next.name}`, data: { from: first.id, to: next.id, auto: true }, createdAt: at } });
  return true;
}
