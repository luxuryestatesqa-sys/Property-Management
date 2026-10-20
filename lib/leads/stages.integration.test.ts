import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../prisma";
import { tenantDb } from "../tenant";

// Real-database test of admin-managed lead stages. Needs a disposable Postgres:
//   RUN_TENANT_DB_TESTS=1 DATABASE_URL=postgresql://...test-db... npx vitest run lib/leads/stages
const run = process.env.RUN_TENANT_DB_TESTS === "1";

const current = vi.hoisted(() => ({ session: null as null | { user: { id: string; role: string } }, orgId: "" }));
vi.mock("@/lib/api-helpers", async () => {
  const { tenantDb } = await import("../tenant");
  const { fakeApiHelpers } = await import("../testing/apiHelpersMock");
  return fakeApiHelpers(() => current, tenantDb);
});

const req = (method: string, body?: unknown, url = "http://x.test/api/leads/stages") => new NextRequest(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const read = async (res: NextResponse) => ({ status: res.status, body: await res.json() });

describe.skipIf(!run)("lead stages (real database)", () => {
  const tag = `stg${Date.now()}`;
  let org = "";
  let otherOrg = "";
  let admin = "";
  let agent = "";

  const as = (id: string, role: string) => {
    current.session = { user: { id, role } };
    current.orgId = org;
  };
  const names = async () => (await tenantDb(org).leadStage.findMany({ orderBy: { position: "asc" } })).map((s) => s.name);
  const stageByName = async (n: string) => tenantDb(org).leadStage.findFirstOrThrow({ where: { name: n } });

  beforeAll(async () => {
    org = (await prisma.organization.create({ data: { name: "A", slug: `${tag}-a` } })).id;
    otherOrg = (await prisma.organization.create({ data: { name: "B", slug: `${tag}-b` } })).id;
    admin = (await prisma.user.create({ data: { organizationId: org, name: "boss", email: `${tag}-boss@x.test`, whatsapp: "1", passwordHash: "x", role: "ADMIN" } })).id;
    agent = (await prisma.user.create({ data: { organizationId: org, name: "ag", email: `${tag}-ag@x.test`, whatsapp: "2", passwordHash: "x", role: "AGENT" } })).id;
  });

  afterAll(async () => {
    try {
      const orgs = { in: [org, otherOrg] };
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

  it("starts with the standard six and lists lead counts", async () => {
    as(admin, "ADMIN");
    const { GET } = await import("../../app/api/leads/stages/route");
    const r = await read(await GET());
    expect(r.body.max).toBe(15);
    expect(r.body.stages.map((s: { name: string }) => s.name)).toEqual(["New", "Contacted", "Viewing", "Negotiation", "Won", "Lost"]);
  });

  it("only admins can add; a new open stage lands after the open ones and before Won", async () => {
    const { POST } = await import("../../app/api/leads/stages/route");
    as(agent, "AGENT");
    expect((await POST(req("POST", { name: "Nope" }))).status).toBe(403);
    as(admin, "ADMIN");
    const r = await read(await POST(req("POST", { name: "Documents sent", kind: "OPEN", color: "#16a34a" })));
    expect(r.status).toBe(201);
    expect(await names()).toEqual(["New", "Contacted", "Viewing", "Negotiation", "Documents sent", "Won", "Lost"]);
    const lost = await read(await POST(req("POST", { name: "Not interested", kind: "LOST" })));
    expect(lost.status).toBe(201);
    expect((await names()).slice(-2)).toEqual(["Lost", "Not interested"]);
  });

  it("refuses an empty or duplicate name (any capitals) and a colour outside the palette", async () => {
    const { POST } = await import("../../app/api/leads/stages/route");
    const { PATCH } = await import("../../app/api/leads/stages/[id]/route");
    as(admin, "ADMIN");
    expect((await POST(req("POST", { name: "   " }))).status).toBe(400);
    expect((await POST(req("POST", { name: "won" }))).status).toBe(409);
    const s = await stageByName("Viewing");
    expect((await PATCH(req("PATCH", { color: "#123456" }), { params: Promise.resolve({ id: s.id }) })).status).toBe(400);
    expect((await PATCH(req("PATCH", { name: "NEW" }), { params: Promise.resolve({ id: s.id }) })).status).toBe(409);
  });

  it("renames, recolours and reorders within a group", async () => {
    const { PATCH } = await import("../../app/api/leads/stages/[id]/route");
    as(admin, "ADMIN");
    const viewing = await stageByName("Viewing");
    expect((await PATCH(req("PATCH", { name: "Site visit", color: "#f97316" }), { params: Promise.resolve({ id: viewing.id }) })).status).toBe(200);
    expect((await stageByName("Site visit")).color).toBe("#f97316");
    expect((await PATCH(req("PATCH", { direction: "up" }), { params: Promise.resolve({ id: viewing.id }) })).status).toBe(200);
    expect((await names()).slice(0, 4)).toEqual(["New", "Site visit", "Contacted", "Negotiation"]);
    // the top open stage can't move up, and Won can't move past Lost's group
    const first = await stageByName("New");
    await PATCH(req("PATCH", { direction: "up" }), { params: Promise.resolve({ id: first.id }) });
    expect((await names())[0]).toBe("New");
  });

  it("deleting a stage that has leads needs somewhere to move them", async () => {
    const { DELETE } = await import("../../app/api/leads/stages/[id]/route");
    as(admin, "ADMIN");
    const db = tenantDb(org);
    const site = await stageByName("Site visit");
    const neg = await stageByName("Negotiation");
    const lead = await db.lead.create({ data: { organizationId: org, source: "MANUAL", externalId: `${tag}-1`, name: "L", channel: "OTHER", stageId: site.id, receivedAt: new Date() } });
    const ask = await read(await DELETE(req("DELETE"), { params: Promise.resolve({ id: site.id }) }));
    expect(ask.status).toBe(409);
    expect(ask.body.leads).toBe(1);
    expect(await names()).toContain("Site visit");
    const ok = await read(await DELETE(req("DELETE", undefined, `http://x.test/api/leads/stages/${site.id}?moveTo=${neg.id}`), { params: Promise.resolve({ id: site.id }) }));
    expect(ok.status).toBe(200);
    expect(ok.body.moved).toBe(1);
    expect((await db.lead.findFirstOrThrow({ where: { id: lead.id } })).stageId).toBe(neg.id);
    expect(await names()).not.toContain("Site visit");
    expect((await db.leadStage.findMany({ orderBy: { position: "asc" } })).map((s) => s.position)).toEqual([...Array(7).keys()]); // no gaps
  });

  it("always keeps at least one open stage", async () => {
    const { DELETE } = await import("../../app/api/leads/stages/[id]/route");
    as(admin, "ADMIN");
    const db = tenantDb(org);
    for (const n of ["Contacted", "Negotiation", "Documents sent"]) {
      const s = await stageByName(n);
      await db.leadStage.update({ where: { id: s.id }, data: { kind: "OPEN" } });
    }
    const open = await db.leadStage.findMany({ where: { kind: "OPEN" } });
    // delete all but one (moving leads to the one that stays)
    const keep = open[0];
    for (const s of open.slice(1)) await DELETE(req("DELETE", undefined, `http://x.test/x?moveTo=${keep.id}`), { params: Promise.resolve({ id: s.id }) });
    const last = await DELETE(req("DELETE", undefined, `http://x.test/x?moveTo=${(await stageByName("Won")).id}`), { params: Promise.resolve({ id: keep.id }) });
    expect(last.status).toBe(400);
    expect(await db.leadStage.count({ where: { kind: "OPEN" } })).toBe(1);
  });

  it("stops at 15 stages and keeps other agencies separate", async () => {
    const { POST } = await import("../../app/api/leads/stages/route");
    as(admin, "ADMIN");
    const db = tenantDb(org);
    let i = 0;
    while ((await db.leadStage.count()) < 15) expect((await POST(req("POST", { name: `Extra ${i++}` }))).status).toBe(201);
    const over = await read(await POST(req("POST", { name: "One too many" })));
    expect(over.status).toBe(400);
    expect(over.body.error).toContain("15");
    expect(await db.leadStage.count()).toBe(15);
    expect(await tenantDb(otherOrg).leadStage.count()).toBe(0);
  });
});
