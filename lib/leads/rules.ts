import { tenantDb } from "@/lib/tenant";

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

// The first active rule that fits this lead (rules run in position order), and the
// agent it hands the lead to. Returns null when no rule applies, in which case the
// default routing (Property Finder profile, then listing owner) takes over.
export async function pickAgentByRules(orgId: string, lead: { region: string | null }): Promise<RuleMatch | null> {
  const db = tenantDb(orgId);
  const rules = await db.assignmentRule.findMany({ where: { active: true }, orderBy: { position: "asc" } });
  if (rules.length === 0) return null;

  for (const rule of rules) {
    const fits =
      rule.kind === "ROUND_ROBIN" || (rule.kind === "REGION" && rule.matchText && lead.region?.toLowerCase().includes(rule.matchText.trim().toLowerCase()));
    if (!fits) continue;

    // Only agents who are still active in this agency.
    const active = await db.user.findMany({ where: { id: { in: rule.agentIds }, status: "ACTIVE" }, select: { id: true } });
    const ids = active.map((u) => u.id);
    if (ids.length === 0) continue;
    if (ids.length === 1) return { userId: ids[0], ruleName: rule.name };

    const counts = await openLeadCounts(orgId, ids);
    const best = [...ids].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0))[0];
    return { userId: best, ruleName: rule.name };
  }
  return null;
}

// Runs the rules over every lead still waiting in the Unassigned inbox. Returns how
// many were assigned. Each assignment is written to the lead's timeline.
export async function applyRulesToUnassigned(orgId: string, actorUserId: string | null): Promise<{ checked: number; assigned: number }> {
  const db = tenantDb(orgId);
  const leads = await db.lead.findMany({ where: { assignedToId: null }, select: { id: true, region: true }, orderBy: { receivedAt: "asc" }, take: 500 });
  let assigned = 0;
  for (const lead of leads) {
    const match = await pickAgentByRules(orgId, lead);
    if (!match) continue;
    await db.lead.update({ where: { id: lead.id }, data: { assignedToId: match.userId } });
    await db.leadActivity.create({
      data: { organizationId: orgId, leadId: lead.id, userId: actorUserId, type: "ASSIGNED", text: `Assigned by rule “${match.ruleName}”`, data: { to: match.userId, rule: match.ruleName } },
    });
    assigned++;
  }
  return { checked: leads.length, assigned };
}
