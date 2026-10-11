import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../prisma";
import { tenantDb } from "../tenant";

// Real-database test of the Leads page bulk actions. Needs a disposable Postgres:
//   RUN_TENANT_DB_TESTS=1 DATABASE_URL=postgresql://...test-db... npx vitest run lib/leads/bulk
const run = process.env.RUN_TENANT_DB_TESTS === "1";

const current = vi.hoisted(() => ({ session: null as null | { user: { id: string; role: string } }, orgId: "" }));
vi.mock("@/lib/api-helpers", async () => {
  const { tenantDb } = await import("../tenant");
  return {
    requireSession: async () => ({ session: current.session as never, db: tenantDb(current.orgId), orgId: current.orgId, error: null }),
    parseJsonBody: async (req: NextRequest) => ({ value: await req.json(), error: null }),
  };
});

const post = async (body: unknown) => {
  const { POST } = await import("../../app/api/leads/bulk/route");
  const res = await POST(new NextRequest("http://x.test/api/leads/bulk", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
  return { status: res.status, body: await res.json() };
};

describe.skipIf(!run)("bulk lead actions (real database)", () => {
  const tag = `bulk${Date.now()}`;
  let org = "";
  let otherOrg = "";
  let ali = "";
  let sara = "";
  let admin = "";
  const leadIds: string[] = [];
  let otherLead = "";
  let stages: { id: string; name: string }[] = [];

  const as = (id: string, role: string) => {
    current.session = { user: { id, role } };
    current.orgId = org;
  };

  beforeAll(async () => {
    org = (await prisma.organization.create({ data: { name: "A", slug: `${tag}-a` } })).id;
    otherOrg = (await prisma.organization.create({ data: { name: "B", slug: `${tag}-b` } })).id;
    const mk = (o: string, n: string, role: "AGENT" | "ADMIN") => prisma.user.create({ data: { organizationId: o, name: n, email: `${tag}-${n}@x.test`, whatsapp: "1", passwordHash: "x", role } }).then((u) => u.id);
    ali = await mk(org, "ali", "AGENT");
    sara = await mk(org, "sara", "AGENT");
    admin = await mk(org, "boss", "ADMIN");
    const { ensureStages } = await import("./stages");
    stages = await ensureStages(org);
    const otherStages = await ensureStages(otherOrg);
    const mkLead = (o: string, i: number, stageId: string, assignedToId: string | null) =>
      prisma.lead.create({ data: { organizationId: o, source: "MANUAL", externalId: `${tag}-${o === org ? "a" : "b"}${i}`, name: `Lead ${i}`, channel: "OTHER", stageId, assignedToId, receivedAt: new Date() } }).then((l) => l.id);
    for (let i = 0; i < 6; i++) leadIds.push(await mkLead(org, i, stages[0].id, i < 2 ? ali : null));
    otherLead = await mkLead(otherOrg, 0, otherStages[0].id, null);
  });

  afterAll(async () => {
    try {
      const orgs = { in: [org, otherOrg] };
      await prisma.leadGroupLink.deleteMany({ where: { organizationId: orgs } });
      await prisma.leadGroup.deleteMany({ where: { organizationId: orgs } });
      await prisma.leadActivity.deleteMany({ where: { organizationId: orgs } });
      await prisma.lead.deleteMany({ where: { organizationId: orgs } });
      await prisma.leadStage.deleteMany({ where: { organizationId: orgs } });
      await prisma.user.deleteMany({ where: { organizationId: orgs } });
      await prisma.organization.deleteMany({ where: { id: orgs } });
    } catch {
      // best effort on a disposable database
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  });

  it("a manager assigns many leads to one agent and each gets a timeline entry", async () => {
    as(admin, "ADMIN");
    const r = await post({ action: "assign", leadIds: leadIds.slice(2, 4), agentId: sara });
    expect(r.body.count).toBe(2);
    const db = tenantDb(org);
    expect(await db.lead.count({ where: { id: { in: leadIds.slice(2, 4) }, assignedToId: sara } })).toBe(2);
    expect(await db.leadActivity.count({ where: { leadId: { in: leadIds.slice(2, 4) }, type: "ASSIGNED", text: "Assigned to sara" } })).toBe(2);
  });

  it("round robin spreads the leads across the chosen agents", async () => {
    as(admin, "ADMIN");
    const r = await post({ action: "assign", roundRobin: true, agentIds: [ali, sara], leadIds });
    expect(r.status).toBe(200);
    const db = tenantDb(org);
    const toAli = await db.lead.count({ where: { id: { in: leadIds }, assignedToId: ali } });
    const toSara = await db.lead.count({ where: { id: { in: leadIds }, assignedToId: sara } });
    expect(toAli + toSara).toBe(6);
    expect(Math.abs(toAli - toSara)).toBeLessThanOrEqual(2); // within the batch the work is shared
    expect(await db.leadActivity.count({ where: { leadId: { in: leadIds }, text: { contains: "(round robin)" } } })).toBeGreaterThan(0);
  });

  it("sending leads back to Unassigned works", async () => {
    as(admin, "ADMIN");
    await post({ action: "assign", leadIds: leadIds.slice(0, 2), agentId: null });
    expect(await tenantDb(org).lead.count({ where: { id: { in: leadIds.slice(0, 2) }, assignedToId: null } })).toBe(2);
  });

  it("changes the stage for many leads, logs it, and counts the first move as the first response", async () => {
    as(admin, "ADMIN");
    const contacted = stages.find((s) => s.name === "Contacted")!;
    const r = await post({ action: "stage", leadIds, stageId: contacted.id });
    expect(r.body.count).toBe(6);
    const db = tenantDb(org);
    const rows = await db.lead.findMany({ where: { id: { in: leadIds } } });
    expect(rows.every((l) => l.stageId === contacted.id && l.firstContactedAt)).toBe(true);
    expect(await db.leadActivity.count({ where: { leadId: { in: leadIds }, type: "STAGE_CHANGED" } })).toBe(6);
    expect((await post({ action: "stage", leadIds, stageId: contacted.id })).body.count).toBe(0); // already there
  });

  it("adds leads to a group and takes them out again", async () => {
    as(admin, "ADMIN");
    const group = await tenantDb(org).leadGroup.create({ data: { organizationId: org, name: "Investors" } });
    expect((await post({ action: "group-add", leadIds, groupId: group.id })).body.count).toBe(6);
    expect((await post({ action: "group-add", leadIds, groupId: group.id })).body.count).toBe(0); // no duplicates
    expect((await post({ action: "group-remove", leadIds: leadIds.slice(0, 2), groupId: group.id })).body.count).toBe(2);
    expect(await tenantDb(org).leadGroupLink.count({ where: { groupId: group.id } })).toBe(4);
  });

  it("an agent can change stage on their own leads only, and can't assign or delete", async () => {
    await prisma.lead.updateMany({ where: { id: { in: leadIds } }, data: { assignedToId: null } });
    await prisma.lead.update({ where: { id: leadIds[0] }, data: { assignedToId: ali } });
    as(ali, "AGENT");
    const won = stages.find((s) => s.name === "Won")!;
    const r = await post({ action: "stage", leadIds, stageId: won.id });
    expect(r.body.count).toBe(1); // only the one that is Ali's
    expect((await tenantDb(org).lead.findFirstOrThrow({ where: { id: leadIds[1] } })).stageId).not.toBe(won.id);
    expect((await post({ action: "assign", leadIds, agentId: ali })).status).toBe(403);
    expect((await post({ action: "delete", leadIds })).status).toBe(403);
  });

  it("only an admin deletes, other agencies are untouched, and bad requests are refused", async () => {
    as(admin, "ADMIN");
    expect((await post({ action: "delete", leadIds: [otherLead] })).status).toBe(404); // not in this agency
    expect(await tenantDb(otherOrg).lead.count()).toBe(1);
    expect((await post({ action: "delete", leadIds: [] })).status).toBe(400);
    expect((await post({ action: "assign", leadIds, agentId: "nobody" })).status).toBe(404);
    const r = await post({ action: "delete", leadIds: leadIds.slice(0, 3) });
    expect(r.body.count).toBe(3);
    const db = tenantDb(org);
    expect(await db.lead.count()).toBe(3);
    expect(await db.leadActivity.count({ where: { leadId: { in: leadIds.slice(0, 3) } } })).toBe(0); // their timeline went with them
  });
});
