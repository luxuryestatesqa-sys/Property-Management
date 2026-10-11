import { tenantDb } from "@/lib/tenant";

// How big a share of the leads an agent gets (1-10; missing or odd values count as 1).
export function shareOf(shares: unknown, userId: string): number {
  const v = shares && typeof shares === "object" ? (shares as Record<string, unknown>)[userId] : undefined;
  return typeof v === "number" && Number.isFinite(v) ? Math.min(10, Math.max(1, Math.round(v))) : 1;
}

// The next agent for a shared lead: the one with the least open work for their share, so an
// agent with share 3 carries three times the open leads of an agent with share 1. Ties go to
// the bigger share, then to the first in the list.
export function pickLeastLoaded(ids: string[], open: Map<string, number>, shares: unknown): string {
  return [...ids].sort((a, b) => {
    const la = (open.get(a) ?? 0) / shareOf(shares, a);
    const lb = (open.get(b) ?? 0) / shareOf(shares, b);
    return la - lb || shareOf(shares, b) - shareOf(shares, a);
  })[0];
}

export interface RuleMatch {
  userId: string;
  ruleName: string;
}

// Open leads per agent (leads still in an OPEN stage), used to hand the next lead
// to whoever is least busy.
export async function openLeadCounts(orgId: string, agentIds: string[]): Promise<Map<string, number>> {
  const db = tenantDb(orgId);
  const grouped = await db.lead.groupBy({
    by: ["assignedToId"],
    where: { assignedToId: { in: agentIds }, stage: { kind: "OPEN" } },
    _count: { _all: true },
  });
  const map = new Map<string, number>(agentIds.map((id) => [id, 0]));
  for (const g of grouped) if (g.assignedToId) map.set(g.assignedToId, g._count._all);
  return map;
}

// Loads the agency's rules once and returns a function that hands out agents. Each pick counts
// as one more open lead for that agent, so a batch (an import, "apply rules") is shared fairly
// without asking the database again for every lead. It returns null when no rule fits, in which
// case the caller decides what happens (Property Finder leads never come through here).
export async function makeRulePicker(orgId: string): Promise<(lead: { region: string | null }) => RuleMatch | null> {
  const db = tenantDb(orgId);
  const rules = await db.assignmentRule.findMany({ where: { active: true }, orderBy: { position: "asc" } });
  const everyone = [...new Set(rules.flatMap((r) => r.agentIds))];
  const activeIds = new Set((await db.user.findMany({ where: { id: { in: everyone }, status: "ACTIVE" }, select: { id: true } })).map((u) => u.id));
  const open = await openLeadCounts(orgId, everyone);

  return (lead) => {
    for (const rule of rules) {
      const fits = rule.kind === "ROUND_ROBIN" || (rule.kind === "REGION" && rule.matchText && lead.region?.toLowerCase().includes(rule.matchText.trim().toLowerCase()));
      if (!fits) continue;
      const ids = rule.agentIds.filter((id) => activeIds.has(id)); // only agents still active in this agency
      if (ids.length === 0) continue;
      const userId = ids.length === 1 ? ids[0] : pickLeastLoaded(ids, open, rule.shares);
      open.set(userId, (open.get(userId) ?? 0) + 1);
      return { userId, ruleName: rule.name };
    }
    return null;
  };
}

// The first active rule that fits this lead (rules run in position order), and the agent it
// hands the lead to. Returns null when no rule applies.
export async function pickAgentByRules(orgId: string, lead: { region: string | null }): Promise<RuleMatch | null> {
  return (await makeRulePicker(orgId))(lead);
}

// Runs the rules over the leads still waiting in the Unassigned inbox. Property Finder leads are
// left alone: those belong to the listing's owner and are only ever handed over by hand. Returns how
// many were assigned. Each assignment is written to the lead's timeline.
export async function applyRulesToUnassigned(orgId: string, actorUserId: string | null): Promise<{ checked: number; assigned: number }> {
  const db = tenantDb(orgId);
  const leads = await db.lead.findMany({ where: { assignedToId: null, source: { not: "PROPERTY_FINDER" } }, select: { id: true, region: true }, orderBy: { receivedAt: "asc" }, take: 500 });
  let assigned = 0;
  const pick = await makeRulePicker(orgId);
  for (const lead of leads) {
    const match = pick(lead);
    if (!match) continue;
    await db.lead.update({ where: { id: lead.id }, data: { assignedToId: match.userId } });
    await db.leadActivity.create({
      data: { organizationId: orgId, leadId: lead.id, userId: actorUserId, type: "ASSIGNED", text: `Assigned by rule “${match.ruleName}”`, data: { to: match.userId, rule: match.ruleName } },
    });
    assigned++;
  }
  return { checked: leads.length, assigned };
}
