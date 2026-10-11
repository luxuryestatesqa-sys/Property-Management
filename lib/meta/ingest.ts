import { tenantDb } from "@/lib/tenant";
import { firstStageId } from "@/lib/leads/stages";
import { makeRulePicker } from "@/lib/leads/rules";
import type { Prisma } from "@prisma/client";
import type { GraphLead } from "./graph";
import { metaRaw, normalizeMetaLead } from "./mapping";

export interface MetaIngestResult {
  created: boolean;
  leadId: string;
}

// One Facebook / Instagram lead-form submission becomes one lead. Safe to run twice for the same
// lead (Meta retries webhooks, and a manual sync overlaps them): the lead's Meta id is its key.
// Who gets it follows the agency's assignment rules (round robin, or manual = Unassigned). Property
// Finder leads never come through here.
export async function ingestMetaLead(orgId: string, lead: GraphLead, ctx: { pageName?: string; formName?: string | null; pick?: Awaited<ReturnType<typeof makeRulePicker>> } = {}): Promise<MetaIngestResult> {
  const db = tenantDb(orgId);
  const existing = await db.lead.findFirst({ where: { source: "META", externalId: lead.id }, select: { id: true } });
  if (existing) return { created: false, leadId: existing.id };

  const n = normalizeMetaLead(lead);
  const pick = ctx.pick ?? (await makeRulePicker(orgId));
  const match = pick({ region: n.region });
  const stageId = await firstStageId(orgId);

  let created: { id: string };
  try {
    created = await db.lead.create({
      data: {
        organizationId: orgId,
        source: "META",
        externalId: n.externalId,
        name: n.name,
        phone: n.phone,
        email: n.email,
        region: n.region,
        channel: "FORM",
        stageId,
        assignedToId: match?.userId ?? null,
        receivedAt: n.receivedAt,
        raw: metaRaw(lead, { formName: ctx.formName, pageName: ctx.pageName }) as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
  } catch (e) {
    // Two deliveries of the same lead at once: the other one won.
    const won = await db.lead.findFirst({ where: { source: "META", externalId: lead.id }, select: { id: true } });
    if (won) return { created: false, leadId: won.id };
    throw e;
  }

  const via = [n.platformLabel, ctx.formName ? `“${ctx.formName}” form` : "lead form"].join(" ");
  await db.leadActivity.createMany({
    data: [
      { organizationId: orgId, leadId: created.id, type: "RECEIVED", text: `Lead received from ${via}` },
      ...(match ? [{ organizationId: orgId, leadId: created.id, type: "ASSIGNED", text: `Assigned by rule “${match.ruleName}”`, data: { to: match.userId, rule: match.ruleName } }] : [{ organizationId: orgId, leadId: created.id, type: "UNASSIGNED", text: "Waiting in the Unassigned inbox for a manager to assign" }]),
    ],
  });
  return { created: true, leadId: created.id };
}
