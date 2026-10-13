// One source of truth for every lead count on screen. The server groups the visible leads by
// (agent, stage) once; the KPI cards, the agent filter, the stage filter and the "needs attention"
// banner are all derived from that same grid, so they cannot disagree.

export interface CountCell {
  assignedToId: string | null; // null = Unassigned (the admin is a valid assignee, so only "no agent" counts)
  stageId: string;
  count: number;
}
export interface StageInfo {
  id: string;
  kind: "OPEN" | "WON" | "LOST";
}

const sum = (cells: CountCell[]) => cells.reduce((n, c) => n + c.count, 0);

export interface Selection {
  assignee?: string; // "all" | "unassigned" | <userId>
  stageId?: string; // "all" | <stageId>
}

const byAssignee = (cells: CountCell[], assignee = "all") =>
  assignee === "all" ? cells : cells.filter((c) => (assignee === "unassigned" ? c.assignedToId === null : c.assignedToId === assignee));
const byStage = (cells: CountCell[], stageId = "all") => (stageId === "all" ? cells : cells.filter((c) => c.stageId === stageId));

// Count shown next to an agent in the agent filter (honours the chosen stage).
export function agentCount(cells: CountCell[], assignee: string | null | "all", sel: Selection = {}): number {
  const inStage = byStage(cells, sel.stageId);
  if (assignee === "all") return sum(inStage);
  return sum(inStage.filter((c) => c.assignedToId === assignee));
}

// Count shown next to a stage in the stage filter (honours the chosen agent).
export function stageCount(cells: CountCell[], stageId: string | "all", sel: Selection = {}): number {
  return sum(byStage(byAssignee(cells, sel.assignee), stageId));
}

// The KPI cards (honour the chosen agent, never the chosen stage).
export function kpis(cells: CountCell[], stages: StageInfo[], firstOpenStageId: string | undefined, sel: Selection = {}) {
  const scope = byAssignee(cells, sel.assignee);
  const kind = new Map(stages.map((s) => [s.id, s.kind]));
  return {
    total: sum(scope),
    fresh: sum(scope.filter((c) => c.stageId === firstOpenStageId)),
    open: sum(scope.filter((c) => kind.get(c.stageId) === "OPEN")),
    won: sum(scope.filter((c) => kind.get(c.stageId) === "WON")),
    unassigned: sum(scope.filter((c) => c.assignedToId === null)),
  };
}
