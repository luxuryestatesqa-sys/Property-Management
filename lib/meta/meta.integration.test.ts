import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createHmac } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "../prisma";
import { tenantDb } from "../tenant";
import { decryptSecret, signValue } from "../crypto";

// Real-database test of the Facebook / Instagram lead flow, with a pretend Facebook. Needs a
// disposable Postgres:  RUN_TENANT_DB_TESTS=1 DATABASE_URL=postgresql://...test-db... npx vitest run lib/meta
const run = process.env.RUN_TENANT_DB_TESTS === "1";

const current = vi.hoisted(() => ({ session: null as null | { user: { id: string; role: string } }, orgId: "" }));
vi.mock("@/lib/api-helpers", async () => {
  const { tenantDb } = await import("../tenant");
  const { NextResponse } = await import("next/server");
  const ctx = () => ({ session: current.session as never, db: tenantDb(current.orgId), orgId: current.orgId, error: null });
  return {
    requireSession: async () => ctx(),
    requireAdmin: async () => (["OWNER", "ADMIN"].includes(current.session?.user.role ?? "") ? ctx() : { session: null, db: null, orgId: null, error: NextResponse.json({ error: "Admin only" }, { status: 403 }) }),
    parseJsonBody: async (req: NextRequest) => ({ value: await req.json().catch(() => ({})), error: null }),
  };
});

const SECRET = "meta-app-secret";
const sig = (body: string, s = SECRET) => `sha256=${createHmac("sha256", s).update(body).digest("hex")}`;
const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const signedRequest = (o: unknown, s = SECRET) => `${createHmac("sha256", s).update(b64u(o)).digest("base64url")}.${b64u(o)}`;

// A pretend Facebook: answers the Graph calls by path. `calls` records them.
let calls: { method: string; path: string; auth: string | null }[] = [];
let graphFail: null | { status: number; code: number } = null;
let noBusiness = false; // pretend the business_management permission was not granted
const LEADS: Record<string, unknown> = {
  LG1: { id: "LG1", created_time: "2026-10-11T09:30:00+0000", form_id: "F1", ad_name: "Lusail ad", campaign_name: "October", platform: "fb", field_data: [{ name: "full_name", values: ["Meta Buyer"] }, { name: "email", values: ["buyer@x.test"] }, { name: "phone_number", values: ["p:+97455560001"] }, { name: "city", values: ["Lusail"] }, { name: "budget", values: ["8000"] }] },
  LG2: { id: "LG2", form_id: "F1", field_data: [{ name: "full_name", values: ["Second"] }, { name: "phone_number", values: ["+97455560002"] }] },
};
function fakeFacebook() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string, init?: RequestInit) => {
      const u = new URL(String(input));
      const path = u.pathname.replace(/^\/v[\d.]+\//, "");
      const method = init?.method ?? "GET";
      calls.push({ method, path, auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null });
      const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
      if (graphFail && !path.startsWith("oauth") && !/subscribed_apps/.test(path)) return reply({ error: { message: "boom", code: graphFail.code } }, graphFail.status);
      if (path === "oauth/access_token") return reply({ access_token: u.searchParams.get("code") ? "short-user-token" : "long-user-token" });
      if (path === "me") return reply({ id: "fbuser1", name: "Admin Person" });
      if (path === "me/businesses") return noBusiness ? reply({ error: { message: "(#200) Requires business_management permission", code: 200 } }, 403) : reply({ data: [{ id: "BIZ1", name: "Luxury Business" }] });
      if (path === "BIZ1/owned_pages") return reply({ data: [{ id: "P1" }] });
      if (path === "BIZ1/client_pages") return reply({ data: [{ id: "P2" }] });
      if (path === "me/accounts") return reply({ data: [{ id: "P1", name: "Luxury Estates", access_token: "PAGE-TOKEN-1", tasks: ["ADVERTISE", "MANAGE"] }, { id: "P2", name: "Other Brand", access_token: "PAGE-TOKEN-2", tasks: ["ANALYZE"] }, { id: "PTAKEN", name: "Someone Else", access_token: "PAGE-TOKEN-3", tasks: ["ADVERTISE"] }] });
      if (/\/subscribed_apps$|^P\d+\/subscribed_apps$/.test(path)) return reply({ success: true });
      if (path === "P1/leadgen_forms") return reply({ data: [{ id: "F1", name: "Lusail Villas", status: "ACTIVE", leads_count: 3 }, { id: "F2", name: "Old promo", status: "ARCHIVED", leads_count: 0 }, { id: "F3", name: "Gone", status: "DELETED" }] });
      if (path === "F2/leads" || path === "F3/leads") return reply({ data: [] });
      if (path === "F1/leads") return reply({ data: [LEADS.LG1, LEADS.LG2, { id: "LG3", field_data: [{ name: "full_name", values: ["Third"] }, { name: "phone_number", values: ["+97455560003"] }] }] });
      if (path === "F1") return reply({ name: "Lusail Villas", id: "F1" });
      if (LEADS[path]) return reply(LEADS[path]);
      return reply({ error: { message: `unexpected ${method} ${path}`, code: 100 } }, 400);
    })
  );
}

describe.skipIf(!run)("Facebook / Instagram leads (real database)", () => {
  const tag = `meta${Date.now()}`;
  let org = "";
  let otherOrg = "";
  let admin = "";
  let ali = "";
  let sara = "";
  let agent = "";

  const as = (id: string, role: string, o = org) => {
    current.session = { user: { id, role } };
    current.orgId = o;
  };
  const webhook = async (body: unknown, signature?: string | null) => {
    const { POST } = await import("../../app/api/meta/webhook/route");
    const raw = JSON.stringify(body);
    return POST(new NextRequest("http://x.test/api/meta/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": signature === undefined ? sig(raw) : (signature ?? "") } }));
  };
  const event = (leadId: string, pageId = "P1") => ({ object: "page", entry: [{ id: pageId, time: 1, changes: [{ field: "leadgen", value: { leadgen_id: leadId, page_id: pageId, form_id: "F1" } }] }] });
  const callbackUrl = (state: string, extra = "code=abc") => new NextRequest(`http://x.test/api/meta/callback?${extra}&state=${encodeURIComponent(state)}`);

  beforeAll(async () => {
    process.env.META_APP_ID = "123456";
    process.env.META_APP_SECRET = SECRET;
    process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-me";
    process.env.AUTH_SECRET = "integration-auth-secret";
    org = (await prisma.organization.create({ data: { name: "A", slug: `${tag}-a` } })).id;
    otherOrg = (await prisma.organization.create({ data: { name: "B", slug: `${tag}-b` } })).id;
    const mk = (n: string, role: "AGENT" | "ADMIN") => prisma.user.create({ data: { organizationId: org, name: n, email: `${tag}-${n}@x.test`, whatsapp: "1", passwordHash: "x", role } }).then((u) => u.id);
    admin = await mk("boss", "ADMIN");
    ali = await mk("ali", "AGENT");
    sara = await mk("sara", "AGENT");
    agent = ali;
    // a page already connected to the OTHER agency
    const { encryptSecret } = await import("../crypto");
    await prisma.metaPage.create({ data: { organizationId: otherOrg, pageId: "PTAKEN", name: "Someone Else", accessToken: encryptSecret("theirs"), enabled: true } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    graphFail = null;
    calls = [];
  });

  afterAll(async () => {
    try {
      const orgs = { in: [org, otherOrg] };
      await prisma.metaPage.deleteMany({ where: { organizationId: orgs } });
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

  it("connecting: saves the pages the person manages, switched off, with tokens encrypted; refuses another agency's page", async () => {
    fakeFacebook();
    const { GET } = await import("../../app/api/meta/callback/route");
    as(admin, "ADMIN");
    const res = await GET(callbackUrl(signValue({ org, user: admin }, 600)));
    expect(res.headers.get("location")).toContain("meta=connected&pages=2&taken=1");
    const pages = await tenantDb(org).metaPage.findMany({ orderBy: { name: "asc" } });
    expect(pages.map((p) => [p.pageId, p.enabled])).toEqual([["P2", false], ["P1", false]].sort());
    const p1 = pages.find((p) => p.pageId === "P1")!;
    expect(p1.accessToken).not.toContain("PAGE-TOKEN-1");
    expect(decryptSecret(p1.accessToken)).toBe("PAGE-TOKEN-1");
    expect(p1.fbUserId).toBe("fbuser1");
    // grouped under the Business portfolio that owns it (P1) or manages it for a client (P2)
    expect([p1.businessId, p1.businessName]).toEqual(["BIZ1", "Luxury Business"]);
    expect((pages.find((p) => p.pageId === "P2"))!.businessId).toBe("BIZ1");
    expect(pages.find((p) => p.pageId === "P2")!.lastError).toContain("can't run ads"); // no ADVERTISE permission
    // the other agency's page is untouched
    expect(decryptSecret((await prisma.metaPage.findUniqueOrThrow({ where: { pageId: "PTAKEN" } })).accessToken)).toBe("theirs");
  });

  it("connecting is refused for a bad, expired or someone else's state, and when permissions are denied", async () => {
    fakeFacebook();
    const { GET } = await import("../../app/api/meta/callback/route");
    as(admin, "ADMIN");
    expect((await GET(callbackUrl("forged"))).headers.get("location")).toContain("meta=bad_state");
    expect((await GET(callbackUrl(signValue({ org: otherOrg, user: admin }, 600)))).headers.get("location")).toContain("meta=bad_state");
    expect((await GET(callbackUrl(signValue({ org, user: admin }, -5)))).headers.get("location")).toContain("meta=bad_state");
    expect((await GET(callbackUrl(signValue({ org, user: admin }, 600), "error=access_denied"))).headers.get("location")).toContain("meta=denied");
    as(agent, "AGENT");
    expect((await GET(callbackUrl(signValue({ org, user: agent }, 600)))).status).toBe(307); // not an admin: sent to login
  });

  it("turning a page on subscribes it to leadgen with that page's own token; a Facebook refusal is shown", async () => {
    const { PATCH } = await import("../../app/api/meta/pages/[id]/route");
    as(admin, "ADMIN");
    const db = tenantDb(org);
    const p1 = await db.metaPage.findFirstOrThrow({ where: { pageId: "P1" } });
    fakeFacebook();
    const patch = (enabled: boolean) => PATCH(new NextRequest("http://x.test", { method: "PATCH", body: JSON.stringify({ enabled }) }), { params: Promise.resolve({ id: p1.id }) });
    expect((await patch(true)).status).toBe(200);
    expect(calls.find((c) => c.path === "P1/subscribed_apps")).toMatchObject({ method: "POST", auth: "Bearer PAGE-TOKEN-1" });
    expect((await db.metaPage.findFirstOrThrow({ where: { id: p1.id } })).enabled).toBe(true);

    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Token expired", code: 190 } }), { status: 400 })));
    const bad = await patch(false);
    // switching off is best effort: it works even if Facebook says no
    expect(bad.status).toBe(200);
    expect((await db.metaPage.findFirstOrThrow({ where: { id: p1.id } })).enabled).toBe(false);
    expect((await patch(true)).status).toBe(400); // switching on needs Facebook to agree
    expect((await db.metaPage.findFirstOrThrow({ where: { id: p1.id } })).lastError).toContain("Reconnect");
    fakeFacebook();
    await patch(true);
    expect((await db.metaPage.findFirstOrThrow({ where: { id: p1.id } })).lastError).toBeNull();
  });

  it("webhook setup: answers Meta's challenge only with the right verify token", async () => {
    const { GET } = await import("../../app/api/meta/webhook/route");
    const ask = (token: string) => GET(new NextRequest(`http://x.test/api/meta/webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`));
    const ok = await ask("verify-me");
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");
    expect((await ask("nope")).status).toBe(403);
  });

  it("a signed lead event creates a lead for the right agency, assigned by the round robin rule", async () => {
    const db = tenantDb(org);
    await db.assignmentRule.create({ data: { organizationId: org, name: "Share", kind: "ROUND_ROBIN", agentIds: [ali, sara], position: 0, shares: { [ali]: 1, [sara]: 1 } } });
    fakeFacebook();
    expect((await webhook(event("LG1"))).status).toBe(200);
    const lead = await db.lead.findFirstOrThrow({ where: { externalId: "LG1" }, include: { activities: true } });
    expect(lead).toMatchObject({ source: "META", channel: "FORM", name: "Meta Buyer", phone: "+97455560001", email: "buyer@x.test", region: "Lusail" });
    expect([ali, sara]).toContain(lead.assignedToId);
    expect(lead.activities.map((a) => a.type).sort()).toEqual(["ASSIGNED", "RECEIVED"]);
    expect(lead.activities.find((a) => a.type === "RECEIVED")?.text).toBe("Lead received from Facebook “Lusail Villas” form");
    expect(lead.raw).toMatchObject({ form_name: "Lusail Villas", campaign_name: "October", platform: "Facebook", page_name: "Luxury Estates" });
    expect(calls.filter((c) => c.path === "LG1").every((c) => c.auth === "Bearer PAGE-TOKEN-1")).toBe(true); // the page's token, nobody else's
    expect((await db.metaPage.findFirstOrThrow({ where: { pageId: "P1" } })).lastLeadAt).not.toBeNull();
    // the details card can show the form answers
    const { extractLeadDetails } = await import("../leads/details");
    expect(extractLeadDetails({ raw: lead.raw }).map((d) => d.label)).toEqual(expect.arrayContaining(["Budget", "Form", "Campaign", "Platform"]));
  });

  it("Meta retries are harmless: the same lead twice is one lead", async () => {
    fakeFacebook();
    await webhook(event("LG1"));
    await Promise.all([webhook(event("LG2")), webhook(event("LG2"))]);
    expect(await tenantDb(org).lead.count({ where: { source: "META", externalId: "LG1" } })).toBe(1);
    expect(await tenantDb(org).lead.count({ where: { source: "META", externalId: "LG2" } })).toBe(1);
  });

  it("with manual assignment (no rules) a Facebook lead waits Unassigned", async () => {
    await tenantDb(org).assignmentRule.deleteMany({});
    LEADS.LG4 = { id: "LG4", form_id: "F1", field_data: [{ name: "phone_number", values: ["+97455560004"] }] };
    fakeFacebook();
    await webhook(event("LG4"));
    const lead = await tenantDb(org).lead.findFirstOrThrow({ where: { externalId: "LG4" }, include: { activities: true } });
    expect(lead.assignedToId).toBeNull();
    expect(lead.activities.map((a) => a.type)).toContain("UNASSIGNED");
  });

  it("refuses an unsigned or wrongly signed event, and ignores unknown or switched-off pages", async () => {
    fakeFacebook();
    const body = event("LG5");
    expect((await webhook(body, "sha256=00")).status).toBe(401);
    expect((await webhook(body, sig(JSON.stringify(body), "someone-elses-secret"))).status).toBe(401);
    expect((await webhook(body, null)).status).toBe(401);
    expect(await tenantDb(org).lead.count({ where: { externalId: "LG5" } })).toBe(0);
    expect((await webhook(event("LG5", "UNKNOWN"))).status).toBe(200); // not ours: ignored
    const p2 = await tenantDb(org).metaPage.findFirstOrThrow({ where: { pageId: "P2" } }); // connected but switched off
    expect(p2.enabled).toBe(false);
    expect((await webhook(event("LG5", "P2"))).status).toBe(200);
    expect(await tenantDb(org).lead.count({ where: { externalId: "LG5" } })).toBe(0);
    expect(calls.some((c) => c.path === "LG5")).toBe(false); // never even asked Facebook
  });

  it("a revoked token is recorded on the page (not retried); a temporary Facebook problem asks Meta to retry", async () => {
    const db = tenantDb(org);
    fakeFacebook();
    graphFail = { status: 400, code: 190 };
    expect((await webhook(event("LG6"))).status).toBe(200);
    expect((await db.metaPage.findFirstOrThrow({ where: { pageId: "P1" } })).lastError).toContain("Reconnect");
    graphFail = { status: 500, code: 2 };
    expect((await webhook(event("LG6"))).status).toBe(500);
    expect(await db.lead.count({ where: { externalId: "LG6" } })).toBe(0);
  });

  it("'Fetch leads' pulls what Meta still holds, once", async () => {
    const { POST } = await import("../../app/api/meta/pages/[id]/sync/route");
    as(admin, "ADMIN");
    const db = tenantDb(org);
    const p1 = await db.metaPage.findFirstOrThrow({ where: { pageId: "P1" } });
    fakeFacebook();
    const go = async () => (await POST(new NextRequest("http://x.test", { method: "POST" }), { params: Promise.resolve({ id: p1.id }) })).json();
    const first = await go();
    expect(first.fetched).toBe(3);
    expect(first.created).toBe(1); // LG3 was new; LG1 and LG2 already came by webhook
    expect(await db.lead.count({ where: { source: "META" } })).toBe(4); // LG1 LG2 LG3 LG4
    expect((await go()).created).toBe(0);
  });

  it("without the business permission, connecting still works and keeps the grouping it had", async () => {
    const { GET } = await import("../../app/api/meta/callback/route");
    as(admin, "ADMIN");
    noBusiness = true;
    fakeFacebook();
    const res = await GET(callbackUrl(signValue({ org, user: admin }, 600)));
    noBusiness = false;
    expect(res.headers.get("location")).toContain("meta=connected&pages=2");
    expect((await tenantDb(org).metaPage.findFirstOrThrow({ where: { pageId: "P1" } })).businessName).toBe("Luxury Business");
    // a brand-new page found without the permission just has no business
    await prisma.metaPage.deleteMany({ where: { pageId: "P2", organizationId: org } });
    noBusiness = true;
    fakeFacebook();
    await GET(callbackUrl(signValue({ org, user: admin }, 600)));
    noBusiness = false;
    expect((await tenantDb(org).metaPage.findFirstOrThrow({ where: { pageId: "P2" } })).businessId).toBeNull();
  });

  it("lists a page's lead forms from Facebook (not deleted ones) and lets the admin switch each on or off", async () => {
    const { GET, PATCH } = await import("../../app/api/meta/pages/[id]/forms/route");
    as(admin, "ADMIN");
    const db = tenantDb(org);
    const p1 = await db.metaPage.findFirstOrThrow({ where: { pageId: "P1" } });
    fakeFacebook();
    const list = async () => (await (await GET(new NextRequest("http://x.test"), { params: Promise.resolve({ id: p1.id }) })).json()).forms as { id: string; name: string; status: string; leads: number; enabled: boolean }[];
    const forms = await list();
    expect(forms.map((f) => [f.id, f.name, f.status, f.leads, f.enabled])).toEqual([["F1", "Lusail Villas", "ACTIVE", 3, true], ["F2", "Old promo", "ARCHIVED", 0, true]]);
    expect(calls.find((c) => c.path === "P1/leadgen_forms")?.auth).toBe("Bearer PAGE-TOKEN-1");
    const patch = (body: unknown) => PATCH(new NextRequest("http://x.test", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: p1.id }) });
    expect((await patch({ formId: "F2", enabled: false })).status).toBe(200);
    expect((await db.metaPage.findFirstOrThrow({ where: { id: p1.id } })).disabledForms).toEqual(["F2"]);
    expect((await list()).find((f) => f.id === "F2")!.enabled).toBe(false);
    expect((await patch({ formId: "F2", enabled: true })).status).toBe(200);
    expect((await db.metaPage.findFirstOrThrow({ where: { id: p1.id } })).disabledForms).toEqual([]);
    expect((await patch({ enabled: true })).status).toBe(400);
    as(agent, "AGENT");
    expect((await patch({ formId: "F1", enabled: false })).status).toBe(403);
  });

  it("a switched-off form's leads are not imported, by webhook or by fetching; the others still are", async () => {
    const { PATCH } = await import("../../app/api/meta/pages/[id]/forms/route");
    const { POST: sync } = await import("../../app/api/meta/pages/[id]/sync/route");
    as(admin, "ADMIN");
    const db = tenantDb(org);
    const p1 = await db.metaPage.findFirstOrThrow({ where: { pageId: "P1" } });
    LEADS.LG10 = { id: "LG10", form_id: "F1", field_data: [{ name: "phone_number", values: ["+97455560010"] }] };
    LEADS.LG11 = { id: "LG11", form_id: "F2", field_data: [{ name: "phone_number", values: ["+97455560011"] }] };
    fakeFacebook();
    await PATCH(new NextRequest("http://x.test", { method: "PATCH", body: JSON.stringify({ formId: "F2", enabled: false }) }), { params: Promise.resolve({ id: p1.id }) });
    await webhook({ object: "page", entry: [{ id: "P1", time: 1, changes: [{ field: "leadgen", value: { leadgen_id: "LG11", page_id: "P1", form_id: "F2" } }] }] });
    expect(await db.lead.count({ where: { externalId: "LG11" } })).toBe(0);
    expect(calls.some((c) => c.path === "LG11")).toBe(false); // never even fetched
    await webhook(event("LG10")); // F1 is still on
    expect(await db.lead.count({ where: { externalId: "LG10" } })).toBe(1);
    // fetching skips the off form, and can be limited to one form
    calls = [];
    await sync(new NextRequest("http://x.test", { method: "POST", body: JSON.stringify({}) }), { params: Promise.resolve({ id: p1.id }) });
    expect(calls.some((c) => c.path === "F2/leads")).toBe(false);
    expect(calls.some((c) => c.path === "F3/leads")).toBe(false); // deleted forms are skipped too
    calls = [];
    await PATCH(new NextRequest("http://x.test", { method: "PATCH", body: JSON.stringify({ formId: "F2", enabled: true }) }), { params: Promise.resolve({ id: p1.id }) });
    await sync(new NextRequest("http://x.test", { method: "POST", body: JSON.stringify({ formId: "F2" }) }), { params: Promise.resolve({ id: p1.id }) });
    expect(calls.some((c) => c.path === "F2/leads")).toBe(true);
    expect(calls.some((c) => c.path === "F1/leads")).toBe(false); // only the chosen form
  });

  it("status lists only this agency's pages, never tokens; an agent can't use any of it", async () => {
    const { GET } = await import("../../app/api/meta/status/route");
    as(admin, "ADMIN");
    const body = await (await GET(new NextRequest("http://x.test/api/meta/status"))).json();
    expect(body.configured).toBe(true);
    expect(body.pages.map((p: { pageId: string }) => p.pageId).sort()).toEqual(["P1", "P2"]);
    expect(JSON.stringify(body)).not.toMatch(/PAGE-TOKEN|accessToken|v1:/);
    expect(body.webhookUrl).toMatch(/\/api\/meta\/webhook$/);
    as(admin, "ADMIN", otherOrg);
    expect((await (await GET(new NextRequest("http://x.test/api/meta/status"))).json()).pages.map((p: { pageId: string }) => p.pageId)).toEqual(["PTAKEN"]);
    as(agent, "AGENT");
    expect((await GET(new NextRequest("http://x.test/api/meta/status"))).status).toBe(403);
  });

  it("Meta's deauthorize switches the person's pages off; a data-deletion request erases them and returns a status link", async () => {
    const { POST: deauth } = await import("../../app/api/meta/deauthorize/route");
    const { POST: erase } = await import("../../app/api/meta/data-deletion/route");
    const form = (signed: string) => new NextRequest("http://x.test/api/meta/x", { method: "POST", body: new URLSearchParams({ signed_request: signed }), headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect((await deauth(form(signedRequest({ user_id: "fbuser1" }, "wrong")))).status).toBe(400);
    expect((await deauth(form(signedRequest({ user_id: "fbuser1" })))).status).toBe(200);
    const pages = await tenantDb(org).metaPage.findMany();
    expect(pages.every((p) => !p.enabled && p.lastError?.includes("removed the app"))).toBe(true);
    const leadsBefore = await tenantDb(org).lead.count();

    const r = await erase(form(signedRequest({ user_id: "fbuser1" })));
    const body = await r.json();
    expect(body.url).toContain(`/data-deletion?code=${body.confirmation_code}`);
    expect(await tenantDb(org).metaPage.count()).toBe(0);
    expect(await prisma.metaPage.count({ where: { pageId: "PTAKEN" } })).toBe(1); // someone else's connection stays
    expect(await tenantDb(org).lead.count()).toBe(leadsBefore); // the agency keeps the leads it received
    expect((await erase(form("bad.signed"))).status).toBe(400);
  });
});
