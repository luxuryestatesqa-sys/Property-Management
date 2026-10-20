import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../prisma";
import { tenantDb } from "../tenant";

// Real-database test of follow-ups, groups and "needs attention". Needs a disposable Postgres:
//   RUN_TENANT_DB_TESTS=1 DATABASE_URL=postgresql://...test-db... npx vitest run lib/leads/followups
const run = process.env.RUN_TENANT_DB_TESTS === "1";

const current = vi.hoisted(() => ({ session: null as null | { user: { id: string; role: string } }, orgId: "" }));
// The real helpers pull in next-auth, which can't load under vitest, so the session is faked.
vi.mock("@/lib/api-helpers", async () => {
  const { tenantDb } = await import("../tenant");
  const { fakeApiHelpers } = await import("../testing/apiHelpersMock");
  return fakeApiHelpers(() => current, tenantDb);
});

const json = (body: unknown) => new NextRequest("http://x.test/api", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

describe.skipIf(!run)("lead follow-ups and groups (real database)", () => {
  const tag = `fu${Date.now()}`;
  let org = "";
  let otherOrg = "";
  let agent = "";
  let otherAgent = "";
  let manager = "";
  let leadId = "";

  beforeAll(async () => {
    org = (await prisma.organization.create({ data: { name: "A", slug: `${tag}-a` } })).id;
    otherOrg = (await prisma.organization.create({ data: { name: "B", slug: `${tag}-b` } })).id;
    const mk = (o: string, n: string, role: "AGENT" | "ADMIN") => prisma.user.create({ data: { organizationId: o, name: n, email: `${tag}-${n}@x.test`, whatsapp: "1", passwordHash: "x", role } }).then((u) => u.id);
    agent = await mk(org, "agent", "AGENT");
    otherAgent = await mk(org, "other", "AGENT");
    manager = await mk(org, "mgr", "ADMIN");
    const { ensureStages } = await import("./stages");
    const stages = await ensureStages(org);
    leadId = (await prisma.lead.create({ data: { organizationId: org, source: "MANUAL", externalId: `${tag}-1`, name: "Buyer", channel: "WHATSAPP", stageId: stages[0].id, assignedToId: agent, receivedAt: new Date(Date.now() - 3 * 3600_000) } })).id; // older than the 2 hour wait
  });

  afterAll(async () => {
    try {
      const orgs = { in: [org, otherOrg] };
      await prisma.leadTask.deleteMany({ where: { organizationId: orgs } });
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

  const as = (id: string, role: string) => {
    current.session = { user: { id, role } };
    current.orgId = org;
  };

  it("an agent adds a follow-up to their lead, and it lands on the timeline", async () => {
    as(agent, "AGENT");
    const { POST } = await import("../../app/api/leads/[id]/tasks/route");
    const past = new Date(Date.now() - 60_000).toISOString();
    const res = await POST(json({ text: "Call back", dueAt: past }), { params: Promise.resolve({ id: leadId }) });
    expect(res.status).toBe(201);
    const db = tenantDb(org);
    expect(await db.leadTask.count({ where: { leadId, assignedToId: agent } })).toBe(1);
    expect(await db.leadActivity.count({ where: { leadId, type: "TASK_CREATED" } })).toBe(1);
  });

  it("rejects a missing text, a bad date, and an agent who doesn't own the lead", async () => {
    as(agent, "AGENT");
    const { POST } = await import("../../app/api/leads/[id]/tasks/route");
    const p = { params: Promise.resolve({ id: leadId }) };
    expect((await POST(json({ text: "", dueAt: new Date().toISOString() }), p)).status).toBe(400);
    expect((await POST(json({ text: "x", dueAt: "nonsense" }), p)).status).toBe(400);
    as(otherAgent, "AGENT");
    expect((await POST(json({ text: "x", dueAt: new Date().toISOString() }), p)).status).toBe(403);
  });

  it("lists an overdue follow-up under 'needs attention' for its owner only", async () => {
    const { GET } = await import("../../app/api/leads/attention/route");
    as(agent, "AGENT");
    const mine = await (await GET()).json();
    expect(mine.overdue.map((t: { text: string }) => t.text)).toEqual(["Call back"]);
    as(otherAgent, "AGENT");
    const theirs = await (await GET()).json();
    expect(theirs.overdue).toEqual([]);
    expect(theirs.waiting).toEqual([]);
    as(manager, "ADMIN");
    const mgr = await (await GET()).json();
    expect(mgr.waiting.map((l: { id: string }) => l.id)).toEqual([leadId]); // managers see every lead nobody has contacted
  });

  it("counts the overdue follow-up in the sidebar summary, then ticking it off clears it", async () => {
    as(agent, "AGENT");
    const { GET } = await import("../../app/api/leads/summary/route");
    expect((await (await GET()).json()).overdueCount).toBe(1);
    const task = await tenantDb(org).leadTask.findFirstOrThrow({ where: { leadId } });
    const { PATCH } = await import("../../app/api/leads/tasks/[taskId]/route");
    const res = await PATCH(json({ done: true }), { params: Promise.resolve({ taskId: task.id }) });
    expect(res?.status).toBe(200);
    expect((await (await GET()).json()).overdueCount).toBe(0);
    expect(await tenantDb(org).leadActivity.count({ where: { leadId, type: "TASK_DONE" } })).toBe(1);
  });

  it("only managers create groups; the lead's agent can tag it; the list can filter by group", async () => {
    const groups = await import("../../app/api/leads/groups/route");
    as(agent, "AGENT");
    expect((await groups.POST(json({ name: "Investors" }))).status).toBe(403);
    as(manager, "ADMIN");
    const created = await (await groups.POST(json({ name: "Investors" }))).json();
    // same name (any case) returns the existing group instead of a duplicate
    const again = await (await groups.POST(json({ name: "investors" }))).json();
    expect(again.group.id).toBe(created.group.id);
    expect(await tenantDb(org).leadGroup.count()).toBe(1);

    as(agent, "AGENT");
    const { PUT } = await import("../../app/api/leads/[id]/groups/route");
    const put = (ids: string[]) => PUT(json({ groupIds: ids }), { params: Promise.resolve({ id: leadId }) });
    expect((await put([created.group.id])).status).toBe(200);
    expect(await tenantDb(org).leadGroupLink.count({ where: { leadId } })).toBe(1);

    const list = await import("../../app/api/leads/route");
    const filtered = await (await list.GET(new NextRequest(`http://x.test/api/leads?group=${created.group.id}`))).json();
    expect(filtered.leads.map((l: { id: string }) => l.id)).toEqual([leadId]);
    expect(filtered.leads[0].groups[0].name).toBe("Investors");
    const none = await (await list.GET(new NextRequest("http://x.test/api/leads?group=does-not-exist"))).json();
    expect(none.leads).toEqual([]);

    expect((await put([])).status).toBe(200);
    expect(await tenantDb(org).leadGroupLink.count({ where: { leadId } })).toBe(0);
    expect(await tenantDb(org).leadActivity.count({ where: { leadId, type: "GROUP_CHANGED" } })).toBe(2);
  });

  it("saves voice notes and documents, validates them, and keeps file data out of the detail response", async () => {
    const { POST } = await import("../../app/api/leads/[id]/attachments/route");
    const { GET: file } = await import("../../app/api/leads/[id]/attachments/[activityId]/route");
    const { GET: detail } = await import("../../app/api/leads/[id]/route");
    const p = { params: Promise.resolve({ id: leadId }) };
    const b64 = (n: number) => Buffer.alloc(n, 1).toString("base64");

    as(agent, "AGENT");
    const ok = await POST(json({ kind: "VOICE_NOTE", name: "Voice note", dataUrl: `data:audio/webm;codecs=opus;base64,${b64(2000)}` }), p);
    expect(ok.status).toBe(201);
    const { id: voiceId } = await ok.json();
    expect((await POST(json({ kind: "VOICE_NOTE", dataUrl: `data:application/pdf;base64,${b64(10)}` }), p)).status).toBe(400); // wrong type for a voice note
    expect((await POST(json({ kind: "DOCUMENT", dataUrl: `data:text/html;base64,${b64(10)}` }), p)).status).toBe(400); // no HTML uploads
    expect((await POST(json({ kind: "DOCUMENT", dataUrl: `data:application/pdf;base64,${b64(4 * 1024 * 1024)}` }), p)).status).toBe(413);
    expect((await POST(json({ kind: "DOCUMENT", name: "offer.pdf", dataUrl: `data:application/pdf;base64,${b64(500)}` }), p)).status).toBe(201);

    const body = await (await detail(new NextRequest("http://x.test"), p)).json();
    const att = body.lead.activities.filter((a: { type: string }) => a.type === "VOICE_NOTE" || a.type === "DOCUMENT");
    expect(att).toHaveLength(2);
    expect(JSON.stringify(att)).not.toContain("dataUrl");

    const served = await file(new NextRequest("http://x.test"), { params: Promise.resolve({ id: leadId, activityId: voiceId }) });
    expect(served.headers.get("content-type")).toBe("audio/webm");
    expect((await served.arrayBuffer()).byteLength).toBe(2000);

    as(otherAgent, "AGENT"); // not their lead
    expect((await POST(json({ kind: "VOICE_NOTE", dataUrl: `data:audio/webm;base64,${b64(10)}` }), p)).status).toBe(403);
    expect((await file(new NextRequest("http://x.test"), { params: Promise.resolve({ id: leadId, activityId: voiceId }) })).status).toBe(404);
  });

  it("another agency can't see or touch these follow-ups and groups", async () => {
    const other = tenantDb(otherOrg);
    expect(await other.leadTask.count()).toBe(0);
    expect(await other.leadGroup.count()).toBe(0);
    current.session = { user: { id: "someone", role: "ADMIN" } };
    current.orgId = otherOrg;
    const { GET } = await import("../../app/api/leads/attention/route");
    const body = await (await GET()).json();
    expect(body.overdue).toEqual([]);
    expect(body.waiting).toEqual([]);
  });
});
