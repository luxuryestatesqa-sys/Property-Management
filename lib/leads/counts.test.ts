import { describe, it, expect } from "vitest";
import { agentCount, stageCount, kpis, type CountCell } from "./counts";

const stages = [
  { id: "new", kind: "OPEN" as const },
  { id: "view", kind: "OPEN" as const },
  { id: "won", kind: "WON" as const },
];
const cells: CountCell[] = [
  { assignedToId: null, stageId: "new", count: 5 },
  { assignedToId: "admin", stageId: "new", count: 3 },
  { assignedToId: "admin", stageId: "won", count: 1 },
  { assignedToId: "ali", stageId: "view", count: 2 },
];

describe("lead counts", () => {
  it("unassigned means no agent only; the admin is a valid assignee", () => {
    expect(kpis(cells, stages, "new").unassigned).toBe(5);
    expect(agentCount(cells, null)).toBe(5);
    expect(agentCount(cells, "admin")).toBe(4);
  });
  it("KPIs, agent counts and stage counts all add up to the same total", () => {
    const k = kpis(cells, stages, "new");
    expect(k.total).toBe(11);
    expect(k.fresh + (k.open - k.fresh) + k.won).toBe(k.total);
    expect(agentCount(cells, "all")).toBe(k.total);
    expect(stageCount(cells, "all")).toBe(k.total);
    expect(stages.reduce((n, s) => n + stageCount(cells, s.id), 0)).toBe(k.total);
  });
  it("filters narrow each other", () => {
    expect(stageCount(cells, "new", { assignee: "admin" })).toBe(3);
    expect(agentCount(cells, null, { stageId: "view" })).toBe(0);
  });
});
