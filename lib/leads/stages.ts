import { prisma } from "@/lib/prisma";
import type { LeadStageKind } from "@prisma/client";

export const DEFAULT_STAGES: { name: string; kind: LeadStageKind; color: string }[] = [
  { name: "New", kind: "OPEN", color: "#6366f1" },
  { name: "Contacted", kind: "OPEN", color: "#0ea5e9" },
  { name: "Viewing", kind: "OPEN", color: "#f59e0b" },
  { name: "Negotiation", kind: "OPEN", color: "#8b5cf6" },
  { name: "Won", kind: "WON", color: "#10b981" },
  { name: "Lost", kind: "LOST", color: "#94a3b8" },
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

// The stage a brand-new lead starts in: the first OPEN stage.
export async function firstStageId(organizationId: string): Promise<string> {
  const stages = await ensureStages(organizationId);
  return (stages.find((s) => s.kind === "OPEN") ?? stages[0]).id;
}
