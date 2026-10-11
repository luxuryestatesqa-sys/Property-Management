import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../prisma";
import { tenantDb } from "../tenant";

// Real-database test of adding leads by hand and importing them. Needs a disposable Postgres:
//   RUN_TENANT_DB_TESTS=1 DATABASE_URL=postgresql://...test-db... npx vitest run lib/leads/intake
const run = process.env.RUN_TENANT_DB_TESTS === "1";

const current = vi.hoisted(() => ({ session: null as null | { user: { id: string; role: string } }, orgId: "" }));
vi.mock("@/lib/api-helpers", async () => {
  const { tenantDb } = await import("../tenant");
  return {
    requireSession: async () => ({ session: current.session as never, db: tenantDb(current.orgId), orgId: current.orgId, error: null }),
    parseJsonBody: async (req: NextRequest) => ({ value: await req.json(), error: null }),
  };
});

const call = async (path: "list" | "import", body: unknown) => {
  const mod = path === "list" ? await import("../../app/api/leads/route") : await import("../../app/api/leads/import/route");
  const res = await mod.POST(new NextRequest("http://x.test/api/leads", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
  return { status: res.status, body: await res.json() };
};

describe.skipIf(!run)("adding and importing leads (real database)", () => {
  const tag = `imp${Date.now()}`;
  let org = "";
  let otherOrg = "";
  let admin = "";
  let ali = "";
  let sara = "";

  const as = (id: string, role: string) => {
    current.session = { user: { id, role } };
    current.orgId = org;
  };

  beforeAll(async () => {
    org = (await prisma.organization.create({ data: { name: "A", slug: `${tag}-a` } })).id;
    otherOrg = (await prisma.organization.create({ data: { name: "B", slug: `${tag}-b` } })).id;
    const mk = (n: string, role: "AGENT" | "ADMIN") => prisma.user.create({ data: { organizationId: org, name: n, email: `${tag}-${n}@x.test`, whatsapp: "1", passwordHash: "x", role } }).then((u) => u.id);
    admin = await mk("boss", "ADMIN");
    ali = await mk("ali", "AGENT");
    sara = await mk("sara", "AGENT");
  });

  afterAll(async () => {
    try {
      const orgs = { in: [org, otherOrg] };
      await prisma.assignmentRule.deleteMany({ where: { organizationId: orgs } });
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

  it("an agent adds a lead and it is theirs, with a timeline and note", async () => {
    as(ali, "AGENT");
    const r = await call("list", { name: "Walk In", phone: "+974 5550 0001", region: "Lusail", notes: "Wants 2 bedrooms", channel: "CALL", assign: { mode: "none" } }); // an agent can't choose
    expect(r.status).toBe(201);
    const lead = await tenantDb(org).lead.findFirstOrThrow({ where: { id: r.body.id }, include: { activities: true, stage: true } });
    expect(lead).toMatchObject({ name: "Walk In", phone: "+97455500001", source: "MANUAL", channel: "CALL", assignedToId: ali, region: "Lusail" });
    expect(lead.stage.name).toBe("New");
    expect(lead.activities.map((a) => a.type).sort()).toEqual(["ASSIGNED", "NOTE", "RECEIVED"]);
  });

  it("refuses a number we already have, until 'add anyway'; needs a phone or email", async () => {
    as(ali, "AGENT");
    const dup = await call("list", { name: "Again", phone: "+97455500001" });
    expect(dup.status).toBe(409);
    expect(dup.body.duplicate).toBe(true);
    expect(dup.body.existing.name).toBe("Walk In");
    expect((await call("list", { name: "Again", phone: "+97455500001", force: true })).status).toBe(201);
    expect((await call("list", { name: "Nobody" })).status).toBe(400);
    expect((await call("list", { name: "Bad", phone: "12" })).status).toBe(400);
  });

  it("matches a Property Finder lead's number even when it was stored with or without the +", async () => {
    const db = tenantDb(org);
    const stage = (await db.leadStage.findFirstOrThrow({ orderBy: { position: "asc" } })).id;
    await db.lead.create({ data: { organizationId: org, source: "PROPERTY_FINDER", externalId: `${tag}-pf`, name: "PF", phone: "+97433300000", channel: "WHATSAPP", stageId: stage, receivedAt: new Date() } });
    as(ali, "AGENT");
    expect((await call("list", { name: "Same", phone: "97433300000" })).status).toBe(409);
  });

  it("a manager chooses an agent, or leaves it unassigned", async () => {
    as(admin, "ADMIN");
    const a = await call("list", { name: "To Sara", phone: "+97455510001", assign: { mode: "agent", agentId: sara } });
    expect((await tenantDb(org).lead.findFirstOrThrow({ where: { id: a.body.id } })).assignedToId).toBe(sara);
    const n = await call("list", { name: "Nobody yet", phone: "+97455510002", assign: { mode: "none" } });
    expect((await tenantDb(org).lead.findFirstOrThrow({ where: { id: n.body.id } })).assignedToId).toBeNull();
    expect((await call("list", { name: "X", phone: "+97455510003", assign: { mode: "agent" } })).status).toBe(400);
  });

  it("imports a file: skips duplicates (also inside the file) and bad rows, keeps extra columns and the date", async () => {
    as(admin, "ADMIN");
    const r = await call("import", {
      fileName: "meta.csv",
      channel: "WHATSAPP",
      assign: { mode: "agent", agentId: ali },
      rows: [
        { name: "Imp One", phone: "+97455520001", email: "ONE@x.test", region: "Pearl", date: "2026-10-01", extra: { Budget: "9000" } },
        { name: "Imp Two", phone: "+97455520002" },
        { name: "Imp One again", phone: "97455520001" }, // same number in the same file
        { name: "Existing", phone: "+97455500001" }, // already a lead
        { name: "No contact" },
        { name: "Email only", email: "only@x.test", notes: "hello" },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ created: 3, duplicates: 2, invalid: 1 });
    expect(r.body.problems.map((p: { row: number }) => p.row)).toEqual([4, 5, 6]); // rows as numbered in the file (header is row 1)
    const db = tenantDb(org);
    const one = await db.lead.findFirstOrThrow({ where: { name: "Imp One" }, include: { activities: true } });
    expect(one).toMatchObject({ source: "IMPORT", channel: "WHATSAPP", assignedToId: ali, email: "one@x.test" });
    expect(one.receivedAt.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(one.raw).toEqual({ fields: { Budget: "9000" } });
    expect(one.activities.find((a) => a.type === "RECEIVED")?.text).toContain("Imported from meta.csv by boss");
    expect((await db.lead.findFirstOrThrow({ where: { name: "Email only" }, include: { activities: true } })).activities.some((a) => a.type === "NOTE" && a.text === "hello")).toBe(true);
  });

  it("import can share leads across agents by the assignment rules", async () => {
    as(admin, "ADMIN");
    const db = tenantDb(org);
    await db.assignmentRule.create({ data: { organizationId: org, name: "Share", kind: "ROUND_ROBIN", agentIds: [ali, sara], position: 0, shares: { [ali]: 1, [sara]: 1 } } });
    const rows = Array.from({ length: 8 }, (_, i) => ({ name: `Rule ${i}`, phone: `+9745553000${i}` }));
    expect((await call("import", { rows, assign: { mode: "rules" } })).body.created).toBe(8);
    const got = await db.lead.findMany({ where: { name: { startsWith: "Rule " } } });
    expect(got.every((l) => l.assignedToId === ali || l.assignedToId === sara)).toBe(true);
    // The least busy agent gets the next lead, so after the batch their open work is level (within one).
    const open = (id: string) => db.lead.count({ where: { assignedToId: id, stage: { kind: "OPEN" } } });
    expect(Math.abs((await open(ali)) - (await open(sara)))).toBeLessThanOrEqual(1);
    expect(got.some((l) => l.assignedToId === sara)).toBe(true);
    await db.assignmentRule.deleteMany({});
  });

  it("an agent's import is always their own; empty and oversized files are refused; other agencies are untouched", async () => {
    as(sara, "AGENT");
    const r = await call("import", { rows: [{ name: "Mine", phone: "+97455540001" }], assign: { mode: "none" } });
    expect(r.body.created).toBe(1);
    expect((await tenantDb(org).lead.findFirstOrThrow({ where: { name: "Mine" } })).assignedToId).toBe(sara);
    expect((await call("import", { rows: [] })).status).toBe(400);
    const tooMany = await call("import", { rows: Array.from({ length: 1001 }, (_, i) => ({ phone: `+9745560${String(i).padStart(4, "0")}` })) });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error).toContain("1000");
    expect(await tenantDb(otherOrg).lead.count()).toBe(0);
  });
});
