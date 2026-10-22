/// <reference types="vite/client" />
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../prisma";
import { forgetLiveUsers } from "../liveUser";

// Attack-style test of the whole API, against a REAL database and the REAL route handlers:
//   A. every endpoint, with nobody signed in
//   B. every endpoint, signed in as the most powerful person of ANOTHER agency, using this agency's real ids
//   C. every writing endpoint, signed in as a powerful person of their own agency, sent malformed / hostile bodies
//   D. attempts to change things a person must not be able to change (role, agency, owner of a record)
//   E. injection text in every search box
//   F. what the public (no sign-in) endpoints reveal
// Only the sign-in itself (next-auth) is faked. Needs a disposable Postgres, never production:
//   RUN_TENANT_DB_TESTS=1 DATABASE_URL=postgresql://...test-db... npx vitest run lib/e2e/security --testTimeout=1800000
const run = process.env.RUN_TENANT_DB_TESTS === "1";

const cur = vi.hoisted(() => ({ session: null as null | { user: Record<string, unknown> } }));
vi.mock("@/auth", () => ({ auth: async () => cur.session, handlers: {}, signIn: async () => {}, signOut: async () => {} }));

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;
const routeModules = import.meta.glob(["../../app/api/**/route.ts", "../../app/feeds/**/route.ts"]) as Record<string, () => Promise<Record<string, unknown>>>;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const pathOf = (key: string) => key.replace(/^\.\.\/\.\.\/app\//, "").replace(/\/route\.ts$/, "");
const urlFor = (path: string) => `http://x.test/${path.replace(/\[\.\.\.(\w+)\]/g, "x").replace(/\[(\w+)\]/g, "x")}`;

// Endpoints that are meant to answer without a sign-in (each has its own proof: a signature, a token, an API key).
const PUBLIC = [/^api\/auth\//, /^api\/signup$/, /^api\/password-reset\//, /^api\/meta\/(webhook|deauthorize|data-deletion)$/, /^api\/portals\/propertyfinder\/webhook$/, /^api\/public\/listings\//, /^api\/qatar-living\//, /^api\/listings\/\[id\]\/images\/\[imageId\]$/, /^feeds\//];
const isPublic = (path: string) => PUBLIC.some((re) => re.test(path));

const call = async (handler: Handler, path: string, method: string, params: Record<string, string>, body?: BodyInit | null, query = "") => {
  const req = new NextRequest(`${urlFor(path)}${query}`, { method, body: body === undefined || method === "GET" ? undefined : body, headers: { "Content-Type": "application/json" } });
  try {
    const res = await handler(req, { params: Promise.resolve(params) });
    const text = await res.text().catch(() => "");
    return { status: res.status, text, thrown: null as string | null };
  } catch (e) {
    return { status: 599, text: "", thrown: e instanceof Error ? e.message : String(e) };
  }
};

interface Seed {
  org: string;
  owner: string;
  admin: string;
  agent: string;
  stageA: string;
  stageB: string;
  lead: string;
  listing: number;
  image: string;
  user: string; // another agent in this agency (target of user routes)
  team: string;
  viewing: string;
  task: string;
  group: string;
  rule: string;
  metaPage: string;
  activity: string;
  ownerRecord: string;
  shareToken: string;
  feedToken: string;
  qlKey: string;
}

describe.skipIf(!run)("security sweep (real database, real routes)", () => {
  const tag = `sec${Date.now()}`;
  let one: Seed;
  let two: Seed;
  const ids = (s: Seed) => Object.values(s).filter((v) => typeof v === "string" && v.length > 12) as string[];

  async function seedOrg(label: string): Promise<Seed> {
    const org = (await prisma.organization.create({ data: { name: `Agency ${label}`, slug: `${tag}-${label}` } })).id;
    const mk = async (n: string, role: "OWNER" | "ADMIN" | "AGENT") => (await prisma.user.create({ data: { organizationId: org, name: `${label} ${n}`, email: `${tag}-${label}-${n}@x.test`, whatsapp: "+97450000000", passwordHash: "x", role } })).id;
    const owner = await mk("owner", "OWNER");
    const admin = await mk("admin", "ADMIN");
    const agent = await mk("agent", "AGENT");
    const user = await mk("other", "AGENT");
    const [stageA, stageB] = await prisma.$transaction([
      prisma.leadStage.create({ data: { organizationId: org, name: "New", position: 0, kind: "OPEN" } }),
      prisma.leadStage.create({ data: { organizationId: org, name: "Won", position: 1, kind: "WON" } }),
    ]);
    const lead = await prisma.lead.create({ data: { organizationId: org, source: "MANUAL", externalId: `${tag}-${label}`, name: `Secret Lead ${label}`, phone: `+9745${label === "one" ? "1" : "2"}000000`, channel: "WHATSAPP", receivedAt: new Date(), stageId: stageA.id, assignedToId: agent } });
    const shareToken = `tok-${tag}-${label}`;
    const listing = await prisma.listing.create({
      data: {
        organizationId: org, createdById: agent, listingType: "RENT", propertyCategory: "APARTMENT", bedrooms: "TWO", area: "Doha", community: "West Bay", buildingName: `Tower ${label}`, floor: "9", apartmentNumber: `9${label.length}`,
        dupKey: `${tag}|${label}`, rentPrice: 7000, furnished: "FURNISHED", visibility: "PRIVATE", shareToken, ownerName: `Secret Owner ${label}`, ownerPhone: "+97455555555", privateNotes: `private note ${label}`,
        images: { create: [{ url: "data:image/png;base64,AA", sortOrder: 0 }] },
      },
      include: { images: true },
    });
    const team = await prisma.team.create({ data: { organizationId: org, name: `Team ${label}`, managerId: null } });
    const viewing = await prisma.viewing.create({ data: { organizationId: org, leadId: lead.id, agentId: agent, scheduledAt: new Date(Date.now() + 86400_000), createdById: agent } });
    const task = await prisma.leadTask.create({ data: { organizationId: org, leadId: lead.id, assignedToId: agent, text: "call", dueAt: new Date() } });
    const group = await prisma.leadGroup.create({ data: { organizationId: org, name: `Group ${label}` } });
    const rule = await prisma.assignmentRule.create({ data: { organizationId: org, name: `Rule ${label}`, kind: "ROUND_ROBIN", agentIds: [agent], position: 0 } });
    const metaPage = await prisma.metaPage.create({ data: { organizationId: org, pageId: `${tag}-page-${label}`, name: `Page ${label}`, accessToken: `SECRET-FB-TOKEN-${label}` } });
    const activity = await prisma.leadActivity.create({ data: { organizationId: org, leadId: lead.id, type: "DOCUMENT", text: "doc", data: { name: "a.html", mime: "text/html", dataUrl: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" } } });
    const ownerRecord = await prisma.owner.create({ data: { organizationId: org, name: `Owner ${label}`, phone: "+97455512345" } });
    const feedToken = `feed-${tag}-${label}`;
    await prisma.portalCredential.create({ data: { organizationId: org, portal: "PROPERTY_FINDER", apiKey: `SECRET-PF-KEY-${label}`, apiSecret: `SECRET-PF-SECRET-${label}`, feedToken, feedAgencyId: org } });
    const qlKey = `ql-${tag}-${label}`;
    await prisma.portalCredential.create({ data: { organizationId: org, portal: "QATAR_LIVING", feedToken: qlKey } });
    return { org, owner, admin, agent, stageA: stageA.id, stageB: stageB.id, lead: lead.id, listing: listing.id, image: listing.images[0].id, user, team: team.id, viewing: viewing.id, task: task.id, group: group.id, rule: rule.id, metaPage: metaPage.id, activity: activity.id, ownerRecord: ownerRecord.id, shareToken, feedToken, qlKey };
  }

  const as = (userId: string | null, org?: string) => {
    forgetLiveUsers();
    cur.session = userId ? { user: { id: userId, role: "AGENT", status: "ACTIVE", organizationId: org, permissions: [] } } : null;
  };

  // The real value to put in each [segment] of a route, for the given agency's data.
  const paramsFor = (path: string, s: Seed): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const m of path.matchAll(/\[(?:\.\.\.)?(\w+)\]/g)) {
      const name = m[1];
      let v = "x";
      if (name === "id") {
        if (path.startsWith("leads/rules")) v = s.rule;
        else if (path.startsWith("leads/stages")) v = s.stageA;
        else if (path.startsWith("leads/")) v = s.lead;
        else if (path.startsWith("listings/")) v = String(s.listing);
        else if (path.startsWith("users/")) v = s.user;
        else if (path.startsWith("teams/")) v = s.team;
        else if (path.startsWith("viewings/")) v = s.viewing;
        else if (path.startsWith("meta/pages/")) v = s.metaPage;
        else if (path.startsWith("public/listings/")) v = s.shareToken;
      } else if (name === "taskId") v = s.task;
      else if (name === "groupId") v = s.group;
      else if (name === "activityId") v = s.activity;
      else if (name === "imageId") v = s.image;
      else if (name === "portal") v = path.startsWith("feeds/") ? "pf.xml" : "PROPERTY_FINDER";
      else if (name === "referenceNumber") v = `LE-${s.listing}`;
      out[name] = v;
    }
    return out;
  };

  const handlers = async () => {
    const list: { path: string; method: (typeof METHODS)[number]; handler: Handler }[] = [];
    for (const [key, load] of Object.entries(routeModules)) {
      const mod = await load();
      for (const m of METHODS) if (typeof mod[m] === "function") list.push({ path: pathOf(key), method: m, handler: mod[m] as Handler });
    }
    return list;
  };

  const snapshot = async (s: Seed) => {
    const org = s.org;
    return JSON.stringify([
      await prisma.organization.findUnique({ where: { id: org }, select: { name: true, status: true, rolePermissions: true, brandColor: true, logoUrl: true, contactSlaHours: true } }),
      await prisma.user.findMany({ where: { organizationId: org }, orderBy: { id: "asc" }, select: { id: true, name: true, email: true, role: true, status: true, permissions: true, teamId: true, whatsapp: true, passwordHash: true } }),
      await prisma.lead.findMany({ where: { organizationId: org }, orderBy: { id: "asc" }, select: { id: true, name: true, assignedToId: true, stageId: true, phone: true } }),
      await prisma.listing.findMany({ where: { organizationId: org }, orderBy: { id: "asc" }, select: { id: true, createdById: true, status: true, visibility: true, title: true, description: true, shareToken: true, ownerName: true } }),
      await prisma.listingImage.count({ where: { listing: { organizationId: org } } }),
      await prisma.team.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
      await prisma.leadStage.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
      await prisma.assignmentRule.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
      await prisma.viewing.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
      await prisma.leadTask.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
      await prisma.leadGroup.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
      await prisma.leadActivity.count({ where: { organizationId: org } }),
      await prisma.metaPage.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
      await prisma.portalCredential.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
      await prisma.owner.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
    ]);
  };

  beforeAll(async () => {
    one = await seedOrg("one");
    two = await seedOrg("two");
  }, 300_000);

  afterAll(async () => {
    try {
      const orgs = { in: [one?.org, two?.org].filter(Boolean) as string[] };
      await prisma.viewing.deleteMany({ where: { organizationId: orgs } });
      await prisma.leadTask.deleteMany({ where: { organizationId: orgs } });
      await prisma.leadGroupLink.deleteMany({ where: { organizationId: orgs } });
      await prisma.leadActivity.deleteMany({ where: { organizationId: orgs } });
      await prisma.lead.deleteMany({ where: { organizationId: orgs } });
      await prisma.activity.deleteMany({ where: { organizationId: orgs } });
      await prisma.auditLog.deleteMany({ where: { listing: { organizationId: orgs } } });
      await prisma.listing.deleteMany({ where: { organizationId: orgs } });
      await prisma.owner.deleteMany({ where: { organizationId: orgs } });
      await prisma.team.deleteMany({ where: { organizationId: orgs } });
      await prisma.metaPage.deleteMany({ where: { organizationId: orgs } });
      await prisma.portalCredential.deleteMany({ where: { organizationId: orgs } });
      await prisma.assignmentRule.deleteMany({ where: { organizationId: orgs } });
      await prisma.leadGroup.deleteMany({ where: { organizationId: orgs } });
      await prisma.leadStage.deleteMany({ where: { organizationId: orgs } });
      await prisma.user.deleteMany({ where: { organizationId: orgs } });
      await prisma.organization.deleteMany({ where: { id: orgs } });
    } catch {
      // best effort on a disposable database
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  }, 300_000);

  // ---------------------------------------------------------------------------------------------- A
  it("A. finds every endpoint (a new endpoint must be covered by this test)", async () => {
    const list = await handlers();
    expect(list.length).toBeGreaterThan(80);
    // every route file exports at least one handler
    for (const key of Object.keys(routeModules)) expect(list.some((h) => h.path === pathOf(key)), key).toBe(true);
  });

  it("A. with nobody signed in, every private endpoint says 401 and nothing crashes", async () => {
    as(null);
    const bad: string[] = [];
    for (const { path, method, handler } of await handlers()) {
      const r = await call(handler, path, method, paramsFor(path, one), method === "GET" ? undefined : "{}");
      if (r.status >= 500) bad.push(`${method} ${path} -> ${r.status} ${r.thrown ?? ""}`);
      else if (!isPublic(path) && r.status !== 401) bad.push(`${method} ${path} -> ${r.status} (expected 401)`);
    }
    expect(bad).toEqual([]);
  });

  // ---------------------------------------------------------------------------------------------- B
  it("B. another agency's Super Admin and agent cannot read or change this agency's data through any endpoint", async () => {
    const before = await snapshot(one);
    const secrets = ids(one);
    const leaks: string[] = [];
    const crashes: string[] = [];
    const bodies = [
      "{}",
      JSON.stringify({ name: "pwned", title: "pwned", description: "pwned", status: "INACTIVE", stageId: one.stageB, assignedToId: two.agent, role: "OWNER", permissions: ["users.manage"], text: "x", dueAt: new Date().toISOString(), color: "#fff", managerId: one.agent, memberIds: [one.agent, one.user], userIds: [one.user], leadIds: [one.lead], action: "delete", agentId: one.agent, listingId: one.listing, leadId: one.lead, userId: one.user }),
    ];
    for (const who of [two.owner, two.agent]) {
      for (const { path, method, handler } of await handlers()) {
        if (isPublic(path)) continue;
        for (const body of method === "GET" ? [undefined] : bodies) {
          as(who, two.org);
          const r = await call(handler, path, method, paramsFor(path, one), body, method === "DELETE" ? `?userId=${one.user}&confirm=true` : "");
          if (r.status >= 500) crashes.push(`${method} ${path} -> ${r.status} ${r.thrown ?? ""}`);
          for (const s of secrets) if (r.text.includes(s)) leaks.push(`${method} ${path} (as ${who === two.owner ? "owner" : "agent"}) returned the other agency's id ${s.slice(0, 8)}…`);
          for (const word of ["Secret Lead one", "Secret Owner one", "private note one", "SECRET-FB-TOKEN-one", "SECRET-PF-KEY-one", "SECRET-PF-SECRET-one", "Tower one"]) if (r.text.includes(word)) leaks.push(`${method} ${path} leaked "${word}"`);
        }
      }
    }
    expect(crashes).toEqual([]);
    expect(leaks).toEqual([]);
    expect(await snapshot(one)).toBe(before); // not one row of the other agency changed
  }, 1_800_000);

  it("B. their own data is still intact after all that", async () => {
    expect((await prisma.lead.findUnique({ where: { id: one.lead } }))?.name).toBe("Secret Lead one");
    expect(await prisma.user.count({ where: { organizationId: one.org } })).toBe(4);
  });

  // ---------------------------------------------------------------------------------------------- C
  it("C. hostile and malformed bodies never crash an endpoint (the agency's own Super Admin, own data)", async () => {
    const crashes: string[] = [];
    const huge = JSON.stringify({ name: "x".repeat(300_000), text: "y".repeat(300_000), title: "z".repeat(300_000) });
    const bodies: (string | null)[] = ["{bad json", "null", "[]", '"a string"', "12345", "true", '{"__proto__":{"isAdmin":true},"constructor":{"prototype":{"x":1}}}', JSON.stringify({ name: { $gt: "" }, id: { in: ["x"] }, stageId: ["a"], userIds: "no", memberIds: [null, 1, {}], permissions: { a: 1 }, listing: { id: 1 } }), huge, ""];
    for (const { path, method, handler } of await handlers()) {
      if (isPublic(path) || method === "GET") continue;
      for (const body of bodies) {
        as(two.owner, two.org);
        const r = await call(handler, path, method, paramsFor(path, two), body);
        if (r.status >= 500) crashes.push(`${method} ${path} with ${String(body).slice(0, 30)} -> ${r.status} ${r.thrown ?? r.text.slice(0, 80)}`);
      }
    }
    expect(crashes).toEqual([]);
  }, 1_800_000);

  it("C. the public endpoints do not crash on hostile input either", async () => {
    const crashes: string[] = [];
    const bodies: (string | null)[] = ["{bad json", "null", "[]", '"s"', '{"entity":{"type":"lead"},"payload":{"publicProfile":{"id":"x"}}}', '{"entity":null}', '{"type":"listing","entity":{"id":{"a":1},"type":"listing"}}', JSON.stringify({ email: ["a"], password: {}, website: 1, token: 5 }), "x".repeat(500_000)];
    as(null);
    for (const { path, method, handler } of await handlers()) {
      if (!isPublic(path) || method === "GET" || path.startsWith("api/auth/")) continue;
      for (const body of bodies) {
        const r = await call(handler, path, method, paramsFor(path, two), body);
        if (r.status >= 500) crashes.push(`${method} ${path} with ${String(body).slice(0, 30)} -> ${r.status} ${r.thrown ?? ""}`);
      }
    }
    expect(crashes).toEqual([]);
  }, 600_000);

  // ---------------------------------------------------------------------------------------------- D
  describe("D. things nobody may change by asking", () => {
    const route = async <T extends string>(p: T) => (await routeModules[`../../app/api/${p}/route.ts`]()) as Record<string, Handler>;

    it("an agent cannot make themselves more powerful through their own profile", async () => {
      const { PATCH } = await route("me");
      const before = await prisma.user.findUniqueOrThrow({ where: { id: one.agent } });
      as(one.agent, one.org);
      const r = await call(PATCH, "api/me", "PATCH", {}, JSON.stringify({ role: "OWNER", permissions: ["users.manage"], organizationId: two.org, status: "ACTIVE", teamId: one.team, email: `hacked-${tag}@x.test`, whatsapp: "+97450000009", name: "Renamed" }));
      expect(r.status).toBeLessThan(500);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: one.agent } });
      expect(after.role).toBe(before.role);
      expect(after.organizationId).toBe(before.organizationId);
      expect(after.permissions).toEqual(before.permissions);
      expect(after.teamId).toBe(before.teamId);
      expect(after.email).toBe(before.email);
      await prisma.user.update({ where: { id: one.agent }, data: { name: before.name, whatsapp: before.whatsapp } });
    });

    it("a new listing or lead always belongs to the person's own agency and to them, whatever the body says", async () => {
      as(one.agent, one.org);
      const { POST: createListing } = await route("listings");
      const body = { createdById: one.owner, organizationId: two.org, shareToken: "chosen-token", listingType: "RENT", propertyCategory: "APARTMENT", bedrooms: "TWO", sizeSqm: 100, area: "Doha", community: "West Bay", buildingName: `Mass ${tag}`, floor: "1", apartmentNumber: "55", rentPrice: 5000, furnished: "FURNISHED", images: ["data:image/png;base64,AA"] };
      const r = await call(createListing, "api/listings", "POST", {}, JSON.stringify(body));
      expect([200, 201, 409]).toContain(r.status);
      const made = await prisma.listing.findFirst({ where: { buildingName: `Mass ${tag}` } });
      if (made) {
        expect(made.organizationId).toBe(one.org);
        expect(made.createdById).toBe(one.agent);
        expect(made.shareToken).not.toBe("chosen-token");
      }
      const { POST: createLead } = await route("leads");
      const lr = await call(createLead, "api/leads", "POST", {}, JSON.stringify({ name: `Mass Lead ${tag}`, phone: "+97451111222", organizationId: two.org, assignedToId: one.owner, stageId: two.stageA, assign: { mode: "agent", agentId: one.owner } }));
      expect(lr.status).toBeLessThan(500);
      const lead = await prisma.lead.findFirst({ where: { name: `Mass Lead ${tag}` } });
      if (lead) {
        expect(lead.organizationId).toBe(one.org);
        expect(lead.assignedToId).toBe(one.agent); // an agent's lead is always their own
      }
    });

    it("editing a listing cannot move it to another owner, agency, or change its secret link", async () => {
      as(one.agent, one.org);
      const { PATCH } = await route("listings/[id]");
      const before = await prisma.listing.findUniqueOrThrow({ where: { id: one.listing } });
      const r = await call(PATCH, "api/listings/[id]", "PATCH", { id: String(one.listing) }, JSON.stringify({ createdById: one.owner, organizationId: two.org, shareToken: "stolen", title: "Edited title" }));
      expect(r.status).toBeLessThan(500);
      const after = await prisma.listing.findUniqueOrThrow({ where: { id: one.listing } });
      expect(after.createdById).toBe(before.createdById);
      expect(after.organizationId).toBe(before.organizationId);
      expect(after.shareToken).toBe(before.shareToken);
    });

    it("an Admin creating a user cannot place them in another agency, as an Owner, or with a team from elsewhere", async () => {
      as(one.admin, one.org);
      const { POST } = await route("users");
      for (const extra of [{ organizationId: two.org }, { role: "OWNER" }, { teamId: two.team }, { id: two.owner }]) {
        const email = `${tag}-new-${Object.keys(extra)[0]}@x.test`;
        const r = await call(POST, "api/users", "POST", {}, JSON.stringify({ name: "New", email, whatsapp: "+97450000003", password: "abcdefgh1", role: "AGENT", ...extra }));
        expect(r.status).toBeLessThan(500);
        const made = await prisma.user.findUnique({ where: { email } });
        if (made) {
          expect(made.organizationId).toBe(one.org);
          expect(made.role).not.toBe("OWNER");
          expect(made.teamId).toBeNull();
          expect(made.id).not.toBe(two.owner);
        }
      }
    });

    it("an Admin cannot become or create a Super Admin, or touch the Owner", async () => {
      const { PATCH, DELETE } = await route("users/[id]");
      as(one.admin, one.org);
      expect((await call(PATCH, "api/users/[id]", "PATCH", { id: one.admin }, JSON.stringify({ role: "OWNER" }))).status).toBe(400);
      expect((await call(PATCH, "api/users/[id]", "PATCH", { id: one.owner }, JSON.stringify({ status: "INACTIVE" }))).status).toBe(403);
      expect((await call(PATCH, "api/users/[id]", "PATCH", { id: one.owner }, JSON.stringify({ newPassword: "takeover123" }))).status).toBe(403);
      expect((await call(DELETE, "api/users/[id]", "DELETE", { id: one.owner })).status).toBe(403);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: one.owner } })).role).toBe("OWNER");
    });

    it("a deactivated agency and a deactivated person get nothing, immediately", async () => {
      const { GET } = await route("leads");
      await prisma.user.update({ where: { id: one.agent }, data: { status: "INACTIVE" } });
      as(one.agent, one.org);
      expect((await call(GET, "api/leads", "GET", {})).status).toBe(403);
      await prisma.user.update({ where: { id: one.agent }, data: { status: "ACTIVE" } });
      await prisma.organization.update({ where: { id: one.org }, data: { status: "SUSPENDED" } });
      as(one.owner, one.org);
      expect((await call(GET, "api/leads", "GET", {})).status).toBe(403);
      await prisma.organization.update({ where: { id: one.org }, data: { status: "ACTIVE" } });
      as(one.owner, one.org);
      expect((await call(GET, "api/leads", "GET", {})).status).toBe(200);
    });

    it("a session token for a person who no longer exists is refused", async () => {
      const { GET } = await route("leads");
      as("no-such-user-id", one.org);
      expect((await call(GET, "api/leads", "GET", {})).status).toBe(401);
      as(one.agent, two.org); // a token that names the wrong agency for the person
      expect((await call(GET, "api/leads", "GET", {})).status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------------------------- E
  it("E. injection text in every search box and filter is just text", async () => {
    const evil = ["' OR '1'='1", "'; DROP TABLE \"Lead\"; --", "\" OR 1=1 --", "%' UNION SELECT passwordHash FROM \"User\" --", "${7*7}", "{{7*7}}", "<script>alert(1)</script>", "../../etc/passwd", "\u0000", "%00", "\\", "a".repeat(5000)];
    const failures: string[] = [];
    const lists = ["listings", "leads", "activities", "activities/summary", "dashboard", "locations", "owners", "viewings", "agents", "leads/groups", "leads/summary", "leads/attention", "activities/export"];
    for (const text of evil) {
      const q = encodeURIComponent(text);
      const query = `?q=${q}&search=${q}&area=${q}&community=${q}&buildingName=${q}&stage=${q}&assignee=${q}&agent=${q}&source=${q}&type=${q}&status=${q}&sort=${q}&days=${q}&cursor=${q}&from=${q}&to=${q}&types=${q}&agents=${q}&level=${q}&group=${q}&bedrooms=${q}&limit=${q}&page=${q}&offset=${q}`;
      for (const p of lists) {
        as(two.owner, two.org);
        const mod = (await routeModules[`../../app/api/${p}/route.ts`]()) as Record<string, Handler>;
        const r = await call(mod.GET, `api/${p}`, "GET", {}, undefined, query);
        if (r.status >= 500) failures.push(`${p} with ${text.slice(0, 20)} -> ${r.status} ${r.thrown ?? ""}`);
        if (r.text.includes(`passwordHash`) || r.text.includes("SECRET-")) failures.push(`${p} returned secrets for ${text.slice(0, 20)}`);
      }
    }
    expect(failures).toEqual([]);
    expect(await prisma.lead.count({ where: { organizationId: two.org } })).toBeGreaterThan(0); // nothing was dropped
    expect(await prisma.user.count({ where: { organizationId: one.org } })).toBeGreaterThan(0);
  }, 900_000);

  // ---------------------------------------------------------------------------------------------- F
  describe("F. what the endpoints that need no sign-in give away", () => {
    const route = async (p: string) => (await routeModules[`../../app/${p}/route.ts`]()) as Record<string, Handler>;
    const FORBIDDEN = ["Secret Owner", "+97455555555", "private note", "ownerName", "ownerPhone", "createdBy", "passwordHash", "privateNotes", "titleDeed", "SECRET-", "accessToken", "apartmentNumber", "\"floor\"", "organizationId", "permissions"];

    it("a share link shows the listing but never the owner, the agent who made it, the unit, or the agency's id", async () => {
      as(null);
      const { GET } = await route("api/public/listings/[id]");
      const r = await call(GET, "api/public/listings/[id]", "GET", { id: one.shareToken });
      expect(r.status).toBe(200);
      for (const word of FORBIDDEN) expect(r.text, word).not.toContain(word);
      expect(JSON.parse(r.text).listing.buildingName).toBe("Tower one");
    });

    it("a listing number does not open a private listing, or any listing made after tokens, and never another agency's by counting", async () => {
      as(null);
      const { GET } = await route("api/public/listings/[id]");
      // private listing by number: 404; with the secret token: fine (the agent chose to share it)
      expect((await call(GET, "api/public/listings/[id]", "GET", { id: String(one.listing) })).status).toBe(404);
      await prisma.listing.update({ where: { id: one.listing }, data: { visibility: "SHARED" } });
      // shared but new (made after the cutoff): still 404 by number
      expect((await call(GET, "api/public/listings/[id]", "GET", { id: String(one.listing) })).status).toBe(404);
      // counting through numbers finds nothing from either test agency
      for (let n = one.listing - 3; n <= one.listing + 3; n++) {
        const r = await call(GET, "api/public/listings/[id]", "GET", { id: String(n) });
        expect(r.text).not.toContain("Tower one");
        expect(r.text).not.toContain("Tower two");
      }
      // an old shared listing (made before the cutoff) still opens by number, so links already sent keep working
      await prisma.listing.update({ where: { id: one.listing }, data: { createdAt: new Date("2026-10-01T00:00:00Z") } });
      expect((await call(GET, "api/public/listings/[id]", "GET", { id: String(one.listing) })).status).toBe(200);
      await prisma.listing.update({ where: { id: one.listing }, data: { visibility: "PRIVATE", createdAt: new Date() } });
    });

    it("a share link cannot name another agency's agent as the contact", async () => {
      as(null);
      const { GET } = await route("api/public/listings/[id]");
      const r = await call(GET, "api/public/listings/[id]", "GET", { id: one.shareToken }, undefined, `?agent=${two.agent}`);
      expect(JSON.parse(r.text).agent).toBeNull();
      const ok = await call(GET, "api/public/listings/[id]", "GET", { id: one.shareToken }, undefined, `?agent=${one.agent}`);
      expect(JSON.parse(ok.text).agent?.name).toBe("one agent");
    });

    it("a photo needs its own listing: the wrong listing number or a made-up photo id is a 404", async () => {
      as(null);
      const { GET } = await route("api/listings/[id]/images/[imageId]");
      expect((await call(GET, "api/listings/[id]/images/[imageId]", "GET", { id: String(two.listing), imageId: one.image })).status).toBe(404);
      expect((await call(GET, "api/listings/[id]/images/[imageId]", "GET", { id: String(one.listing), imageId: "nope" })).status).toBe(404);
      expect((await call(GET, "api/listings/[id]/images/[imageId]", "GET", { id: String(one.listing), imageId: `${one.image}.jpg` })).status).toBe(200);
    });

    it("feeds and the Qatar Living API need the right key, give each agency only its own, and never private listings", async () => {
      as(null);
      const feed = (await route("feeds/[portal]")).GET;
      const bad = await call(feed, "feeds/[portal]", "GET", { portal: "pf.xml" }, undefined, `?agency=${one.org}&token=wrong`);
      expect(bad.status).toBe(401);
      const swapped = await call(feed, "feeds/[portal]", "GET", { portal: "pf.xml" }, undefined, `?agency=${two.org}&token=${one.feedToken}`);
      expect(swapped.status).toBe(401); // agency 1's token cannot read agency 2's feed
      const mine = await call(feed, "feeds/[portal]", "GET", { portal: "pf.xml" }, undefined, `?agency=${one.org}&token=${one.feedToken}`);
      expect(mine.status).toBe(200);
      expect(mine.text).not.toContain("Tower two");
      expect(mine.text).not.toContain("Secret Owner");
      expect(mine.text).not.toContain("+97455555555");
      const ql = (await route("api/qatar-living/listings")).GET;
      expect((await call(ql, "api/qatar-living/listings", "GET", {})).status).toBe(401);
      expect((await call(ql, "api/qatar-living/listings", "GET", {}, undefined, `?x=1`)).status).toBe(401);
    });

    it("a file attached to a lead is served sandboxed so it cannot run scripts on the site", async () => {
      as(one.owner, one.org);
      const { GET } = await route("api/leads/[id]/attachments/[activityId]");
      const req = new NextRequest("http://x.test/a", { method: "GET" });
      const res = await (GET as Handler)(req, { params: Promise.resolve({ id: one.lead, activityId: one.activity }) });
      expect(res.status).toBe(200);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-security-policy")).toContain("sandbox");
    });
  });
});
