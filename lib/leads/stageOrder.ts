import type { tenantDb } from "@/lib/tenant";

export const MAX_STAGES = 15;

// Colours an admin can pick for a stage.
export const STAGE_COLORS = ["#3b82f6", "#06b6d4", "#14b8a6", "#16a34a", "#84cc16", "#f59e0b", "#f97316", "#f43f5e", "#ec4899", "#8b5cf6", "#6366f1", "#64748b"];

const KIND_ORDER = { OPEN: 0, WON: 1, LOST: 2 } as const;

// Keeps the pipeline tidy: open stages first, then won, then lost, each group in the order the
// admin set, with positions numbered 0, 1, 2… with no gaps.
export async function resequence(db: ReturnType<typeof tenantDb>) {
  const stages = await db.leadStage.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const sorted = [...stages].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]); // stable: keeps the admin's order inside a group
  for (const [i, s] of sorted.entries()) if (s.position !== i) await db.leadStage.update({ where: { id: s.id }, data: { position: i } });
}
