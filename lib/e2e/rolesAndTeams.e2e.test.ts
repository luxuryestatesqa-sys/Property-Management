import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../prisma";
import { forgetLiveUsers } from "../liveUser";

// End-to-end test of roles, permissions and teams, against a REAL database and the REAL route handlers: every
// call below goes through requireSession, the permission checks and the database, as a signed-in person of that
// role. Only the sign-in itself (next-auth) is faked, because it cannot load under vitest.
//
// Needs a disposable Postgres, never production:
//   RUN_TENANT_DB_TESTS=1 DATABASE_URL=postgresql://...test-db... npx vitest run lib/e2e --testTimeout=180000
const run = process.env.RUN_TENANT_DB_TESTS === "1";

const cur = vi.hoisted(() => ({ session: null as null | { user: Record<string, unknown> } }));
vi.mock("@/auth", () => ({ auth: async () => cur.session, handlers: {}, signIn: async () => {}, signOut: async () => {} }));

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://x.test${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const read = async (res: Response | undefined) => ({ status: res!.status, body: (await res!.json().catch(() => null)) as Record<string, any> }); // eslint-disable-line @typescript-eslint/no-explicit-any
const P = <T extends object>(o: T) => ({ params: Promise.resolve(o) });

const R = {
  leads: () => import("../../app/api/leads/route"),
  lead: () => import("../../app/api/leads/[id]/route"),
  bulk: () => import("../../app/api/leads/bulk/route"),
  assignment: () => import("../../app/api/leads/assignment/route"),
  dashboard: () => import("../../app/api/dashboard/route"),
  listings: () => import("../../app/api/listings/route"),
  listing: () => import("../../app/api/listings/[id]/route"),
  listingStatus: () => import("../../app/api/listings/[id]/status/route"),
  activities: () => import("../../app/api/activities/route"),
  viewings: () => import("../../app/api/viewings/route"),
  owners: () => import("../../app/api/owners/route"),
  users: () => import("../../app/api/users/route"),
  user: () => import("../../app/api/users/[id]/route"),
  teams: () => import("../../app/api/teams/route"),
  team: () => import("../../app/api/teams/[id]/route"),
  teamMembers: () => import("../../app/api/teams/[id]/members/route"),
  org: () => import("../../app/api/org/route"),
  orgPermissions: () => import("../../app/api/org/permissions/route"),
};

describe.skipIf(!run)("roles, permissions and teams (real database, real routes)", () => {
  const tag = `e2e${Date.now()}`;
  const ids: Record<string, string> = {};
  const lead: Record<string, string> = {};
  const listing: Record<string, number> = {};
  const viewing: Record<string, string> = {};
  const team: Record<string, string> = {};
  let org1 = "";
  let org2 = "";
  let stageNew = "";
  let stageOther = "";

  const as = (name: string) => {
    forgetLiveUsers();
    cur.session = { user: { id: ids[name], role: "AGENT", status: "ACTIVE", organizationId: name === "z" || name === "ownerZ" ? org2 : org1, permissions: [] } };
  };
  const refresh = () => forgetLiveUsers();
  const leadIds = (b: Record<string, any>) => (b.leads as { id: string }[]).map((l) => l.id).sort(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const sorted = (...names: string[]) => names.map((n) => lead[n]).sort();
  // The ids of every lead currently assigned to any of these people (the tests add leads as they go).
  const leadsOf = async (...names: string[]) => (await prisma.lead.findMany({ where: { organizationId: org1, assignedToId: { in: names.map((n) => ids[n]) } }, select: { id: true } })).map((l) => l.id).sort();
  const listingIds = (b: Record<string, any>) => (b.listings as { id: number }[]).map((l) => l.id); // eslint-disable-line @typescript-eslint/no-explicit-any

  const mkUser = async (org: string, name: string, role: "OWNER" | "ADMIN" | "MANAGER" | "AGENT") => {
    const u = await prisma.user.create({ data: { organizationId: org, name, email: `${tag}-${name}@x.test`, whatsapp: "+97450000000", passwordHash: "x", role } });
    ids[name] = u.id;
    return u.id;
  };
  const mkListing = async (org: string, by: string, n: string, visibility: "SHARED" | "PRIVATE") => {
    const l = await prisma.listing.create({
      data: {
        organizationId: org, createdById: ids[by], listingType: "RENT", propertyCategory: "APARTMENT", bedrooms: "TWO", area: "Doha", community: "West Bay",
        buildingName: `Tower ${n}`, floor: "3", apartmentNumber: `${n}`, dupKey: `${tag}|${n}`, rentPrice: 7000, furnished: "FURNISHED", visibility,
        ownerName: "Secret Owner", ownerPhone: "+97455555555",
        images: { create: [{ url: "data:image/png;base64,AA", sortOrder: 0 }] },
      },
    });
    listing[n] = l.id;
  };
  const mkLead = async (org: string, name: string, assignee: string | null) => {
    const l = await prisma.lead.create({ data: { organizationId: org, source: "MANUAL", externalId: `${tag}-${name}`, name, channel: "WHATSAPP", receivedAt: new Date(), stageId: org === org1 ? stageNew : (await prisma.leadStage.findFirstOrThrow({ where: { organizationId: org } })).id, assignedToId: assignee ? ids[assignee] : null } });
    lead[name] = l.id;
  };

  beforeAll(async () => {
    org1 = (await prisma.organization.create({ data: { name: "Agency One", slug: `${tag}-1` } })).id;
    org2 = (await prisma.organization.create({ data: { name: "Agency Two", slug: `${tag}-2` } })).id;
    const stages = await prisma.$transaction([
      prisma.leadStage.create({ data: { organizationId: org1, name: "New", position: 0, kind: "OPEN" } }),
      prisma.leadStage.create({ data: { organizationId: org1, name: "Contacted", position: 1, kind: "OPEN" } }),
      prisma.leadStage.create({ data: { organizationId: org2, name: "New", position: 0, kind: "OPEN" } }),
    ]);
    stageNew = stages[0].id;
    stageOther = stages[1].id;
    for (const [n, r] of [["owner", "OWNER"], ["admin", "ADMIN"], ["admin2", "ADMIN"], ["mgrA", "MANAGER"], ["mgrB", "MANAGER"], ["mgrL", "MANAGER"], ["a1", "AGENT"], ["a2", "AGENT"], ["b1", "AGENT"], ["x0", "AGENT"]] as const) await mkUser(org1, n, r);
    await mkUser(org2, "z", "AGENT");
    await mkUser(org2, "ownerZ", "OWNER");

    for (const [n, a] of [["L_a1", "a1"], ["L_a2", "a2"], ["L_b1", "b1"], ["L_x0", "x0"], ["L_mgrA", "mgrA"], ["L_un", null]] as const) await mkLead(org1, n, a);
    await mkLead(org2, "L_z", "z");
    for (const [n, by] of [["S_a1", "a1"], ["S_b1", "b1"], ["S_x0", "x0"]] as const) await mkListing(org1, by, n, "SHARED");
    for (const [n, by] of [["P_a1", "a1"], ["P_b1", "b1"], ["P_x0", "x0"]] as const) await mkListing(org1, by, n, "PRIVATE");
    await mkListing(org2, "z", "S_z", "SHARED");

    const when = new Date(Date.now() + 86400_000);
    for (const [n, l, a] of [["V_a1", "L_a1", "a1"], ["V_b1", "L_b1", "b1"]] as const) {
      viewing[n] = (await prisma.viewing.create({ data: { organizationId: org1, leadId: lead[l], agentId: ids[a], scheduledAt: when, createdById: ids[a] } })).id;
    }
    for (const n of ["a1", "a2", "b1", "x0", "mgrA", "mgrB", "admin"]) {
      await prisma.activity.create({ data: { organizationId: org1, type: "call_logged", agentId: ids[n], note: n } });
    }
  }, 180_000);

  afterAll(async () => {
    try {
      const orgs = { in: [org1, org2] };
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
      await prisma.leadStage.deleteMany({ where: { organizationId: orgs } });
      await prisma.user.deleteMany({ where: { organizationId: orgs } });
      await prisma.organization.deleteMany({ where: { id: orgs } });
    } catch {
      // best effort on a disposable database
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  }, 180_000);

  // ------------------------------------------------------------------------------------------------ Agent
  describe("an Agent, by default", () => {
    it("sees only the leads assigned to them", async () => {
      as("a1");
      const { GET } = await R.leads();
      const r = await read(await GET(req("/api/leads")));
      expect(r.status).toBe(200);
      expect(leadIds(r.body)).toEqual(sorted("L_a1"));
    });

    it("cannot open, change or reassign someone else's lead", async () => {
      as("a1");
      const { GET, PATCH } = await R.lead();
      expect((await read(await GET(req("/api/leads/x"), P({ id: lead.L_x0 })))).status).toBe(404);
      expect((await read(await GET(req("/api/leads/x"), P({ id: lead.L_un })))).status).toBe(404);
      expect((await read(await PATCH(req("/api/leads/x", "PATCH", { stageId: stageOther }), P({ id: lead.L_x0 })))).status).toBe(403);
      expect((await read(await PATCH(req("/api/leads/x", "PATCH", { assignedToId: ids.a1 }), P({ id: lead.L_a1 })))).status).toBe(403); // own lead, but reassigning is a manager's job
    });

    it("cannot use manager, admin or team tools", async () => {
      as("a1");
      expect((await read(await (await R.dashboard()).GET(req("/api/dashboard")))).status).toBe(403);
      expect((await read(await (await R.assignment()).GET())).status).toBe(403);
      expect((await read(await (await R.users()).GET())).status).toBe(403);
      expect((await read(await (await R.users()).POST(req("/api/users", "POST", { name: "n", email: `${tag}-n@x.test`, whatsapp: "+97450000001", password: "abcdef", role: "AGENT" })))).status).toBe(403);
      expect((await read(await (await R.teams()).GET())).status).toBe(403);
      expect((await read(await (await R.teams()).POST(req("/api/teams", "POST", { name: "Mine" })))).status).toBe(403);
      expect((await read(await (await R.org()).PATCH(req("/api/org", "PATCH", { name: "Hacked" })))).status).toBe(403);
      expect((await read(await (await R.orgPermissions()).PUT(req("/api/org/permissions", "PUT", { ADMIN: [], MANAGER: [], AGENT: ["leads.viewAll"] })))).status).toBe(403);
      expect((await read(await (await R.bulk()).POST(req("/api/leads/bulk", "POST", { action: "delete", leadIds: [lead.L_a1] })))).status).toBe(403);
      expect((await read(await (await R.bulk()).POST(req("/api/leads/bulk", "POST", { action: "assign", leadIds: [lead.L_a1], agentId: ids.a2 })))).status).toBe(403);
    });

    it("sees shared listings and their own private ones, never other agents' private listings", async () => {
      as("a1");
      const { GET } = await R.listings();
      const r = await read(await GET(req("/api/listings?pageSize=100")));
      const got = listingIds(r.body);
      expect(got).toEqual(expect.arrayContaining([listing.S_a1, listing.P_a1, listing.S_b1, listing.S_x0]));
      expect(got).not.toContain(listing.P_b1);
      expect(got).not.toContain(listing.P_x0);
      expect(got).not.toContain(listing.S_z); // another agency
      const one = await R.listing();
      expect((await read(await one.GET(req("/api/listings/x"), P({ id: String(listing.P_b1) })))).status).toBe(404);
      const shared = await read(await one.GET(req("/api/listings/x"), P({ id: String(listing.S_b1) })));
      expect(shared.status).toBe(200);
      expect(shared.body.listing.ownerName).toBeNull(); // owner details are hidden from other agents
      const mine = await read(await one.GET(req("/api/listings/x"), P({ id: String(listing.S_a1) })));
      expect(mine.body.listing.ownerName).toBe("Secret Owner");
    });

    it("cannot edit or switch off someone else's listing", async () => {
      as("a1");
      expect((await read(await (await R.listing()).PATCH(req("/api/listings/x", "PATCH", { title: "mine now" }), P({ id: String(listing.S_b1) })))).status).toBe(403);
      expect((await read(await (await R.listingStatus()).PATCH(req("/x", "PATCH", { status: "INACTIVE" }), P({ id: String(listing.S_b1) })))).status).toBe(403);
    });

    it("sees only their own activities and viewings", async () => {
      as("a1");
      const acts = await read(await (await R.activities()).GET(req("/api/activities")));
      expect(acts.body.rows.length).toBeGreaterThan(0);
      expect(acts.body.rows.every((a: { agentId: string }) => a.agentId === ids.a1)).toBe(true);
      const v = await read(await (await R.viewings()).GET(req("/api/viewings")));
      expect(v.body.viewings.map((x: { id: string }) => x.id)).toEqual([viewing.V_a1]);
    });

    it("cannot book a viewing for another agent, or on someone else's lead", async () => {
      as("a1");
      const { POST } = await R.viewings();
      const when = new Date(Date.now() + 2 * 86400_000).toISOString();
      expect((await read(await POST(req("/api/viewings", "POST", { leadId: lead.L_a1, agentId: ids.b1, scheduledAt: when })))).status).toBe(403);
      expect((await read(await POST(req("/api/viewings", "POST", { leadId: lead.L_b1, scheduledAt: when })))).status).toBe(404);
    });
  });

  // ------------------------------------------------------------------------------- Manager without a team
  describe("a Manager who is not in charge of a team (as managers were before teams)", () => {
    it("sees every lead in the agency, including the unassigned pool, and the dashboard", async () => {
      as("mgrL");
      const r = await read(await (await R.leads()).GET(req("/api/leads")));
      expect(leadIds(r.body)).toEqual(sorted("L_a1", "L_a2", "L_b1", "L_x0", "L_mgrA", "L_un"));
      const d = await read(await (await R.dashboard()).GET(req("/api/dashboard")));
      expect(d.status).toBe(200);
      expect(d.body.unassigned).toBe(1);
    });

    it("does not get listings, users or teams powers they were never given", async () => {
      as("mgrL");
      const l = await read(await (await R.listings()).GET(req("/api/listings?pageSize=100")));
      expect(listingIds(l.body)).not.toContain(listing.P_a1);
      expect((await read(await (await R.listing()).PATCH(req("/x", "PATCH", { title: "x" }), P({ id: String(listing.S_a1) })))).status).toBe(403);
      expect((await read(await (await R.users()).GET())).status).toBe(403);
      expect((await read(await (await R.teams()).GET())).status).toBe(403);
      expect((await read(await (await R.bulk()).POST(req("/api/leads/bulk", "POST", { action: "delete", leadIds: [lead.L_a1] })))).status).toBe(403);
    });
  });

  // ------------------------------------------------------------------------------------------------ Teams
  describe("creating teams", () => {
    it("the Admin creates Sales Team A and B; their managers get what they need to run a team", async () => {
      as("admin");
      const { POST } = await R.teams();
      const a = await read(await POST(req("/api/teams", "POST", { name: "Sales Team A", managerId: ids.mgrA, memberIds: [ids.a1, ids.a2] })));
      expect(a.status).toBe(201);
      expect(a.body.grantedToManager).toEqual(expect.arrayContaining(["listings.viewAll", "listings.editAll"]));
      team.A = a.body.team.id;
      const b = await read(await POST(req("/api/teams", "POST", { name: "Sales Team B", managerId: ids.mgrB, memberIds: [ids.b1] })));
      expect(b.status).toBe(201);
      team.B = b.body.team.id;
      const members = await prisma.user.findMany({ where: { teamId: team.A }, select: { id: true } });
      expect(members.map((m) => m.id).sort()).toEqual([ids.a1, ids.a2].sort());
    });

    it("refuses a duplicate name, a manager who is not a Manager, and an Admin as a member", async () => {
      as("admin");
      const { POST } = await R.teams();
      expect((await read(await POST(req("/api/teams", "POST", { name: "Sales Team A" })))).status).toBe(409);
      expect((await read(await POST(req("/api/teams", "POST", { name: "Bad", managerId: ids.a1 })))).status).toBe(400);
      expect((await read(await POST(req("/api/teams", "POST", { name: "Bad2", memberIds: [ids.admin2] })))).status).toBe(400);
      expect((await read(await POST(req("/api/teams", "POST", { name: "x" })))).status).toBe(400);
    });

    it("an Agent or a Manager without the Teams permission cannot create or change a team", async () => {
      for (const who of ["a1", "mgrA", "mgrL"]) {
        as(who);
        expect((await read(await (await R.teams()).POST(req("/api/teams", "POST", { name: `Rogue ${who}` })))).status).toBe(403);
        expect((await read(await (await R.team()).PATCH(req("/x", "PATCH", { name: "Renamed" }), P({ id: team.A })))).status).toBe(403);
        expect((await read(await (await R.team()).DELETE(req("/x", "DELETE"), P({ id: team.A })))).status).toBe(403);
      }
    });
  });

  // ------------------------------------------------------------------------------------ Team manager
  describe("a team Manager (Sales Team A)", () => {
    it("sees their team's leads and nobody else's, not even the unassigned pool", async () => {
      as("mgrA");
      const { GET } = await R.leads();
      expect(leadIds((await read(await GET(req("/api/leads")))).body)).toEqual(sorted("L_a1", "L_a2", "L_mgrA"));
      expect((await read(await GET(req("/api/leads?assignee=unassigned")))).body.leads).toEqual([]);
      expect((await read(await GET(req(`/api/leads?assignee=${ids.b1}`)))).body.leads).toEqual([]);
      const one = await R.lead();
      for (const other of ["L_b1", "L_x0", "L_un"]) expect((await read(await one.GET(req("/x"), P({ id: lead[other] })))).status).toBe(404);
      expect((await read(await one.GET(req("/x"), P({ id: lead.L_a1 })))).status).toBe(200);
    });

    it("can hand a lead to someone in their team, but not to another team or back to the pool", async () => {
      as("mgrA");
      const { PATCH } = await R.lead();
      expect((await read(await PATCH(req("/x", "PATCH", { assignedToId: ids.b1 }), P({ id: lead.L_a1 })))).status).toBe(403);
      expect((await read(await PATCH(req("/x", "PATCH", { assignedToId: ids.x0 }), P({ id: lead.L_a1 })))).status).toBe(403);
      expect((await read(await PATCH(req("/x", "PATCH", { assignedToId: null }), P({ id: lead.L_a1 })))).status).toBe(403);
      expect((await read(await PATCH(req("/x", "PATCH", { assignedToId: ids.a2 }), P({ id: lead.L_a1 })))).status).toBe(200);
      expect((await read(await PATCH(req("/x", "PATCH", { assignedToId: ids.a1 }), P({ id: lead.L_a1 })))).status).toBe(200); // and back
      // another team's lead cannot be touched at all
      expect((await read(await PATCH(req("/x", "PATCH", { stageId: stageOther }), P({ id: lead.L_b1 })))).status).toBe(403);
    });

    it("bulk actions stay inside the team, and they cannot delete leads", async () => {
      as("mgrA");
      const { POST } = await R.bulk();
      expect((await read(await POST(req("/api/leads/bulk", "POST", { action: "assign", leadIds: [lead.L_a2], agentId: ids.b1 })))).status).toBe(403);
      expect((await read(await POST(req("/api/leads/bulk", "POST", { action: "assign", leadIds: [lead.L_a2], agentId: ids.a1 })))).status).toBe(200);
      expect((await read(await POST(req("/api/leads/bulk", "POST", { action: "assign", leadIds: [lead.L_a1] })))).status).toBe(400); // "back to unassigned" would hide it from them
      expect((await read(await POST(req("/api/leads/bulk", "POST", { action: "delete", leadIds: [lead.L_a1] })))).status).toBe(403);
      // another team's lead is simply not found among the leads they can act on
      const r = await read(await POST(req("/api/leads/bulk", "POST", { action: "assign", leadIds: [lead.L_b1], agentId: ids.a1 })));
      expect(r.body.count ?? 0).toBe(0);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.L_b1 } })).assignedToId).toBe(ids.b1);
      await prisma.lead.update({ where: { id: lead.L_a2 }, data: { assignedToId: ids.a2 } });
    });

    it("cannot use the agency's waiting-lead pool or its assignment rules", async () => {
      as("mgrA");
      expect((await read(await (await R.assignment()).GET())).status).toBe(403);
      const { POST } = await R.leads();
      expect((await read(await POST(req("/api/leads", "POST", { name: "Via rules", phone: "+97450001111", assign: { mode: "rules" } })))).status).toBe(403);
      expect((await read(await POST(req("/api/leads", "POST", { name: "Other team", phone: "+97450002222", assign: { mode: "agent", agentId: ids.b1 } })))).status).toBe(403);
      const ok = await read(await POST(req("/api/leads", "POST", { name: "For my team", phone: "+97450003333", assign: { mode: "agent", agentId: ids.a1 } })));
      expect(ok.status).toBe(201);
    });

    it("sees a dashboard for their team only", async () => {
      as("mgrA");
      const d = await read(await (await R.dashboard()).GET(req("/api/dashboard")));
      expect(d.status).toBe(200);
      const teamIds = [ids.a1, ids.a2, ids.mgrA];
      const expected = await prisma.lead.count({ where: { organizationId: org1, assignedToId: { in: teamIds } } });
      expect(d.body.totalLeads).toBe(expected);
      expect(d.body.unassigned).toBe(0);
      expect(d.body.activeListings).toBe(await prisma.listing.count({ where: { organizationId: org1, status: "ACTIVE", createdById: { in: teamIds } } }));
      // a filter for another team's agent returns nothing rather than their numbers
      const other = await read(await (await R.dashboard()).GET(req(`/api/dashboard?agent=${ids.b1}`)));
      expect(other.body.totalLeads).toBe(0);
      const unassigned = await read(await (await R.dashboard()).GET(req("/api/dashboard?agent=unassigned")));
      expect(unassigned.body.totalLeads).toBe(0);
      for (const a of d.body.perAgent as { id: string | null }[]) expect(a.id === null || teamIds.includes(a.id)).toBe(true);
    });

    it("sees and manages their team's listings, including private ones, and no other team's", async () => {
      as("mgrA");
      const got = listingIds((await read(await (await R.listings()).GET(req("/api/listings?pageSize=100")))).body);
      expect(got).toEqual(expect.arrayContaining([listing.S_a1, listing.P_a1]));
      expect(got).not.toContain(listing.P_b1);
      expect(got).not.toContain(listing.P_x0);
      const one = await R.listing();
      const mine = await read(await one.GET(req("/x"), P({ id: String(listing.P_a1) })));
      expect(mine.status).toBe(200);
      expect(mine.body.listing.ownerName).toBe("Secret Owner"); // their agent's owner details are theirs to see
      expect(mine.body.canEdit).toBe(true);
      expect((await read(await one.GET(req("/x"), P({ id: String(listing.P_b1) })))).status).toBe(404);
      const theirs = await read(await one.GET(req("/x"), P({ id: String(listing.S_b1) })));
      expect(theirs.body.listing.ownerName).toBeNull();
      expect(theirs.body.canEdit).toBe(false);
      expect((await read(await one.PATCH(req("/x", "PATCH", { title: "Team A edit" }), P({ id: String(listing.S_a1) })))).status).toBe(200);
      expect((await read(await one.PATCH(req("/x", "PATCH", { title: "nope" }), P({ id: String(listing.S_b1) })))).status).toBe(403);
      expect((await read(await (await R.listingStatus()).PATCH(req("/x", "PATCH", { status: "INACTIVE" }), P({ id: String(listing.S_b1) })))).status).toBe(403);
      expect((await read(await (await R.listingStatus()).PATCH(req("/x", "PATCH", { status: "ACTIVE" }), P({ id: String(listing.S_a1) })))).status).toBe(200);
    });

    it("sees their team's activities and viewings only", async () => {
      as("mgrA");
      const acts = await read(await (await R.activities()).GET(req("/api/activities")));
      const team3 = [ids.a1, ids.a2, ids.mgrA];
      expect(acts.body.rows.length).toBeGreaterThan(0);
      expect(acts.body.rows.every((a: { agentId: string }) => team3.includes(a.agentId))).toBe(true);
      const v = await read(await (await R.viewings()).GET(req("/api/viewings")));
      expect(v.body.viewings.map((x: { id: string }) => x.id)).toEqual([viewing.V_a1]);
      const when = new Date(Date.now() + 3 * 86400_000).toISOString();
      expect((await read(await (await R.viewings()).POST(req("/api/viewings", "POST", { leadId: lead.L_a1, agentId: ids.b1, scheduledAt: when })))).status).toBe(403);
      expect((await read(await (await R.viewings()).POST(req("/api/viewings", "POST", { leadId: lead.L_a1, agentId: ids.a2, scheduledAt: when })))).status).toBe(201);
    });

    it("still cannot manage users, teams or settings", async () => {
      as("mgrA");
      expect((await read(await (await R.users()).GET())).status).toBe(403);
      expect((await read(await (await R.teams()).POST(req("/api/teams", "POST", { name: "Mine too" })))).status).toBe(403); // can look at their team, not create one
      expect((await read(await (await R.org()).PATCH(req("/x", "PATCH", { name: "x" })))).status).toBe(403);
    });

    it("Sales Team B's manager sees only Team B, and neither team sees the other", async () => {
      as("mgrB");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).toEqual(sorted("L_b1"));
      const got = listingIds((await read(await (await R.listings()).GET(req("/api/listings?pageSize=100")))).body);
      expect(got).toEqual(expect.arrayContaining([listing.P_b1]));
      expect(got).not.toContain(listing.P_a1);
      expect((await read(await (await R.lead()).GET(req("/x"), P({ id: lead.L_a1 })))).status).toBe(404);
    });

    it("an Agent in the team still sees only their own work, not the team's", async () => {
      as("a2");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).toEqual(sorted("L_a2"));
      expect((await read(await (await R.dashboard()).GET(req("/api/dashboard")))).status).toBe(403);
    });
  });

  // ------------------------------------------------------------------------------------ A team's page
  describe("a team's page: its numbers, and adding and removing people", () => {
    const teamDetail = async (who: string, teamKey: string) => {
      as(who);
      return read(await (await R.team()).GET(req("/x"), P({ id: team[teamKey] })));
    };
    const countsFor = async (...names: string[]) => {
      const who = names.map((n) => ids[n]);
      return {
        leads: await prisma.lead.count({ where: { organizationId: org1, assignedToId: { in: who } } }),
        listings: await prisma.listing.count({ where: { organizationId: org1, createdById: { in: who } } }),
        activeListings: await prisma.listing.count({ where: { organizationId: org1, createdById: { in: who }, status: "ACTIVE" } }),
      };
    };

    it("shows the team's people with their listings and leads, and the totals", async () => {
      const r = await teamDetail("admin", "A");
      expect(r.status).toBe(200);
      expect(r.body.canEdit).toBe(true);
      expect(r.body.team.name).toBe("Sales Team A");
      const people = (r.body.members as { id: string }[]).map((m) => m.id).sort();
      expect(people).toEqual([ids.a1, ids.a2, ids.mgrA].sort()); // two agents, and the manager is counted too
      const want = await countsFor("a1", "a2", "mgrA");
      expect(r.body.totals.people).toBe(3);
      expect(r.body.totals.leads.total).toBe(want.leads);
      expect(r.body.totals.listings.total).toBe(want.listings);
      expect(r.body.totals.listings.active).toBe(want.activeListings);
      // each person's own numbers add up to the totals
      const sum = (f: (m: Record<string, any>) => number) => (r.body.members as Record<string, any>[]).reduce((n, m) => n + f(m), 0); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(sum((m) => m.leads.total)).toBe(r.body.totals.leads.total);
      expect(sum((m) => m.listings.total)).toBe(r.body.totals.listings.total);
      const a1 = (r.body.members as Record<string, any>[]).find((m) => m.id === ids.a1)!; // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(a1.leads.total).toBe((await countsFor("a1")).leads);
      expect(a1.listings.total).toBe((await countsFor("a1")).listings);
      expect(a1.isManager).toBe(false);
      expect((r.body.members as Record<string, any>[])[0].id).toBe(ids.mgrA); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect((r.body.members as Record<string, any>[])[0].isManager).toBe(true); // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(r.body.totals.leads.open + r.body.totals.leads.won + r.body.totals.leads.lost).toBe(r.body.totals.leads.total);
    });

    it("lists who could be added, and the team they are in now; never an Admin, an Owner, or someone already in it", async () => {
      const r = await teamDetail("admin", "A");
      const c = r.body.candidates as { id: string; team: string | null }[];
      const got = c.map((x) => x.id);
      expect(got).toEqual(expect.arrayContaining([ids.b1, ids.x0, ids.mgrB, ids.mgrL]));
      for (const never of [ids.a1, ids.a2, ids.admin, ids.admin2, ids.owner, ids.z]) expect(got).not.toContain(never);
      expect(c.find((x) => x.id === ids.b1)?.team).toBe("Sales Team B");
      expect(c.find((x) => x.id === ids.x0)?.team).toBeNull();
    });

    it("the team's own manager can open it (to look, not to change), and nobody else can", async () => {
      const mine = await teamDetail("mgrA", "A");
      expect(mine.status).toBe(200);
      expect(mine.body.canEdit).toBe(false);
      expect(mine.body.candidates).toEqual([]);
      expect(mine.body.totals.people).toBe(3);
      expect((await teamDetail("mgrA", "B")).status).toBe(403); // another team's page
      expect((await teamDetail("mgrB", "A")).status).toBe(403);
      expect((await teamDetail("mgrL", "A")).status).toBe(403); // a manager of no team
      expect((await teamDetail("a1", "A")).status).toBe(403); // even a member only sees their own work
      expect((await teamDetail("ownerZ", "A")).status).toBe(404); // another agency
    });

    it("the list of teams: everything for those who manage teams, only their own for a team manager, nothing for an agent", async () => {
      as("admin");
      expect(((await read(await (await R.teams()).GET())).body.teams as { id: string }[]).map((t) => t.id)).toEqual(expect.arrayContaining([team.A, team.B]));
      as("mgrA");
      const mine = await read(await (await R.teams()).GET());
      expect(mine.status).toBe(200);
      expect((mine.body.teams as { id: string }[]).map((t) => t.id)).toEqual([team.A]);
      as("mgrL");
      expect((await read(await (await R.teams()).GET())).status).toBe(403);
      as("a1");
      expect((await read(await (await R.teams()).GET())).status).toBe(403);
    });

    it("only someone with the Teams permission can add or remove people", async () => {
      for (const who of ["mgrA", "a1", "mgrL"]) {
        as(who);
        expect((await read(await (await R.teamMembers()).POST(req("/x", "POST", { userIds: [ids.x0] }), P({ id: team.A })))).status).toBe(403);
        expect((await read(await (await R.teamMembers()).DELETE(req(`/x?userId=${ids.a1}`, "DELETE"), P({ id: team.A })))).status).toBe(403);
      }
      expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.x0 } })).teamId).toBeNull();
      expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.a1 } })).teamId).toBe(team.A);
    });

    it("adding a person puts their leads and listings in the team's numbers and in front of its manager", async () => {
      as("admin");
      const before = (await teamDetail("admin", "A")).body.totals;
      const add = await read(await (await R.teamMembers()).POST(req("/x", "POST", { userIds: [ids.x0] }), P({ id: team.A })));
      expect(add.status).toBe(200);
      expect(add.body.added).toBe(1);
      const after = (await teamDetail("admin", "A")).body;
      expect(after.totals.people).toBe(before.people + 1);
      const x0 = await countsFor("x0");
      expect(after.totals.leads.total).toBe(before.leads.total + x0.leads);
      expect(after.totals.listings.total).toBe(before.listings.total + x0.listings);
      expect((after.candidates as { id: string }[]).map((c) => c.id)).not.toContain(ids.x0);
      // and the team manager now sees that agent's leads and private listings, straight away
      as("mgrA");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).toContain(lead.L_x0);
      expect(listingIds((await read(await (await R.listings()).GET(req("/api/listings?pageSize=100")))).body)).toContain(listing.P_x0);
    });

    it("removing a person takes them out of the numbers and out of sight, but they keep their own work", async () => {
      as("admin");
      const rm = await read(await (await R.teamMembers()).DELETE(req(`/x?userId=${ids.x0}`, "DELETE"), P({ id: team.A })));
      expect(rm.status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.x0 } })).teamId).toBeNull();
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.L_x0 } })).assignedToId).toBe(ids.x0); // their leads stay with them
      expect((await teamDetail("admin", "A")).body.totals.people).toBe(3);
      as("mgrA");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).not.toContain(lead.L_x0);
      expect(listingIds((await read(await (await R.listings()).GET(req("/api/listings?pageSize=100")))).body)).not.toContain(listing.P_x0);
      as("x0");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).toEqual(sorted("L_x0")); // still theirs
    });

    it("refuses someone who is not in the team, an Admin, nobody, a stranger from another agency", async () => {
      as("admin");
      const { POST, DELETE } = await R.teamMembers();
      expect((await read(await DELETE(req(`/x?userId=${ids.x0}`, "DELETE"), P({ id: team.A })))).status).toBe(404);
      expect((await read(await DELETE(req("/x", "DELETE"), P({ id: team.A })))).status).toBe(404);
      expect((await read(await POST(req("/x", "POST", { userIds: [ids.admin2] }), P({ id: team.A })))).status).toBe(400);
      expect((await read(await POST(req("/x", "POST", { userIds: [ids.owner] }), P({ id: team.A })))).status).toBe(400);
      expect((await read(await POST(req("/x", "POST", { userIds: [ids.z] }), P({ id: team.A })))).status).toBe(400);
      expect((await read(await POST(req("/x", "POST", { userIds: [] }), P({ id: team.A })))).status).toBe(400);
      expect((await read(await POST(req("/x", "POST", { userIds: "x0" }), P({ id: team.A })))).status).toBe(400);
      expect((await read(await POST(req("/x", "POST", { userIds: [ids.x0] }), P({ id: "no-such-team" })))).status).toBe(404);
      as("ownerZ");
      expect((await read(await POST(req("/x", "POST", { userIds: [ids.z] }), P({ id: team.A })))).status).toBe(404); // not their agency's team
      expect((await read(await DELETE(req(`/x?userId=${ids.a1}`, "DELETE"), P({ id: team.A })))).status).toBe(404);
    });

    it("moving someone from one team to another takes them out of the first", async () => {
      as("admin");
      expect((await read(await (await R.teamMembers()).POST(req("/x", "POST", { userIds: [ids.b1] }), P({ id: team.A })))).status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.b1 } })).teamId).toBe(team.A);
      expect((await teamDetail("admin", "B")).body.totals.people).toBe(1); // only the manager is left
      as("mgrB");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).not.toContain(lead.L_b1);
      // put them back
      as("admin");
      expect((await read(await (await R.teamMembers()).POST(req("/x", "POST", { userIds: [ids.b1] }), P({ id: team.B })))).status).toBe(200);
      as("mgrB");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).toContain(lead.L_b1);
    });

    it("a deactivated person cannot be added, and the totals count an inactive member that is already in", async () => {
      await prisma.user.update({ where: { id: ids.x0 }, data: { status: "INACTIVE" } });
      as("admin");
      expect((await read(await (await R.teamMembers()).POST(req("/x", "POST", { userIds: [ids.x0] }), P({ id: team.A })))).status).toBe(400);
      await prisma.user.update({ where: { id: ids.x0 }, data: { status: "ACTIVE", teamId: team.A } });
      const r = await teamDetail("admin", "A");
      expect(r.body.totals.people).toBe(4);
      await prisma.user.update({ where: { id: ids.x0 }, data: { status: "INACTIVE" } });
      const r2 = await teamDetail("admin", "A");
      expect(r2.body.totals.people).toBe(4);
      expect(r2.body.totals.activePeople).toBe(3);
      await prisma.user.update({ where: { id: ids.x0 }, data: { status: "ACTIVE", teamId: null } });
      refresh();
    });
  });

  // ---------------------------------------------------------------------------------------- Hierarchy
  describe("Super Admin, Admin and who may create whom", () => {
    const newUser = (email: string, role: string, extra: object = {}) => ({ name: email, email: `${tag}-${email}@x.test`, whatsapp: "+97450000002", password: "abcdef", role, ...extra });

    it("an Admin cannot create an Admin; the Super Admin (Owner) can", async () => {
      as("admin");
      const { POST } = await R.users();
      expect((await read(await POST(req("/api/users", "POST", newUser("adm-by-admin", "ADMIN"))))).status).toBe(403);
      as("owner");
      const made = await read(await POST(req("/api/users", "POST", newUser("adm-by-owner", "ADMIN"))));
      expect(made.status).toBe(201);
      ids.newAdmin = made.body.user.id;
    });

    it("an Admin can add Managers and Agents with permissions, and put them in a team", async () => {
      as("admin");
      const { POST } = await R.users();
      const made = await read(await POST(req("/api/users", "POST", newUser("new-agent", "AGENT", { permissions: ["leads.viewAll"], teamId: team.A }))));
      expect(made.status).toBe(201);
      ids.newAgent = made.body.user.id;
      const row = await prisma.user.findUniqueOrThrow({ where: { id: ids.newAgent } });
      expect(row.teamId).toBe(team.A);
      expect(row.permissions).toEqual(["leads.viewAll"]);
      // an Admin is never in a team
      expect((await read(await POST(req("/api/users", "POST", newUser("adm-team", "ADMIN", { teamId: team.A }))))).status).toBe(403);
    });

    it("an Admin cannot change or reset another Admin or the Owner, but the Owner can change an Admin", async () => {
      const { PATCH, DELETE } = await R.user();
      as("admin");
      expect((await read(await PATCH(req("/x", "PATCH", { status: "INACTIVE" }), P({ id: ids.admin2 })))).status).toBe(403);
      expect((await read(await PATCH(req("/x", "PATCH", { newPassword: "zzzzzz" }), P({ id: ids.owner })))).status).toBe(403);
      expect((await read(await DELETE(req("/x", "DELETE"), P({ id: ids.admin2 })))).status).toBe(403);
      expect((await read(await PATCH(req("/x", "PATCH", { role: "ADMIN" }), P({ id: ids.mgrL })))).status).toBe(403); // cannot promote anyone to Admin
      as("owner");
      expect((await read(await PATCH(req("/x", "PATCH", { permissions: ["dashboard.view"] }), P({ id: ids.admin2 })))).status).toBe(200);
      as("admin2");
      expect((await read(await (await R.dashboard()).GET(req("/api/dashboard")))).status).toBe(200);
      expect((await read(await (await R.users()).GET())).status).toBe(403); // this Admin was restricted to the dashboard
      as("owner");
      expect((await read(await PATCH(req("/x", "PATCH", { permissions: null }), P({ id: ids.admin2 })))).status).toBe(200);
      as("admin2");
      expect((await read(await (await R.users()).GET())).status).toBe(200); // back to the Admin template (everything)
    });

    it("nobody can change their own permissions or role", async () => {
      const { PATCH } = await R.user();
      as("admin");
      expect((await read(await PATCH(req("/x", "PATCH", { permissions: [] }), P({ id: ids.admin })))).status).toBe(400);
      expect((await read(await PATCH(req("/x", "PATCH", { role: "AGENT" }), P({ id: ids.admin })))).status).toBe(400);
    });

    it("someone who may manage users cannot give permissions they do not have, or reach upward", async () => {
      const { PATCH, DELETE } = await R.user();
      as("owner");
      expect((await read(await PATCH(req("/x", "PATCH", { permissions: ["users.manage", "teams.manage"] }), P({ id: ids.mgrL })))).status).toBe(200);
      as("mgrL");
      const { POST } = await R.users();
      expect((await read(await POST(req("/api/users", "POST", newUser("by-mgr-ok", "AGENT", { permissions: ["users.manage"] }))))).status).toBe(201);
      expect((await read(await POST(req("/api/users", "POST", newUser("by-mgr-bad", "AGENT", { permissions: ["settings.agency"] }))))).status).toBe(403);
      expect((await read(await POST(req("/api/users", "POST", newUser("by-mgr-admin", "ADMIN"))))).status).toBe(403);
      expect((await read(await PATCH(req("/x", "PATCH", { status: "INACTIVE" }), P({ id: ids.admin })))).status).toBe(403);
      expect((await read(await DELETE(req("/x", "DELETE"), P({ id: ids.owner })))).status).toBe(403);
      expect((await read(await PATCH(req("/x", "PATCH", { permissions: ["settings.agency"] }), P({ id: ids.a2 })))).status).toBe(403);
      // a Manager's permissions come from the list given above only
      as("owner");
      expect((await read(await PATCH(req("/x", "PATCH", { permissions: null }), P({ id: ids.mgrL })))).status).toBe(200);
    });

    it("only the Owner can change the role templates", async () => {
      const { PUT, GET } = await R.orgPermissions();
      const body = { ADMIN: ["dashboard.view"], MANAGER: ["dashboard.view", "leads.viewAll"], AGENT: [] };
      as("admin");
      expect((await read(await PUT(req("/x", "PUT", body)))).status).toBe(403);
      expect((await read(await GET())).status).toBe(200); // may read them
      as("owner");
      expect((await read(await PUT(req("/x", "PUT", body)))).status).toBe(200);
      expect((await read(await GET())).body.templates.MANAGER).toEqual(["dashboard.view", "leads.viewAll"]);
      // put the defaults back so later tests see the usual Manager
      expect((await read(await PUT(req("/x", "PUT", { ADMIN: (await read(await GET())).body.defaults.ADMIN, MANAGER: (await read(await GET())).body.defaults.MANAGER, AGENT: [] })))).status).toBe(200);
    });

    it("the Owner always has everything, even with an empty permission list saved", async () => {
      await prisma.user.update({ where: { id: ids.owner }, data: { permissions: [] } });
      as("owner");
      expect((await read(await (await R.users()).GET())).status).toBe(200);
      expect((await read(await (await R.teams()).GET())).status).toBe(200);
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body).length).toBe(await prisma.lead.count({ where: { organizationId: org1 } }));
    });
  });

  // ---------------------------------------------------------------------------- Per-person permissions
  describe("permissions set for one person", () => {
    it("lets an Agent see all leads when granted, and takes it away again", async () => {
      as("admin");
      const { PATCH } = await R.user();
      expect((await read(await PATCH(req("/x", "PATCH", { permissions: ["leads.viewAll"] }), P({ id: ids.x0 })))).status).toBe(200);
      as("x0");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body).length).toBe(await prisma.lead.count({ where: { organizationId: org1 } }));
      as("admin");
      expect((await read(await PATCH(req("/x", "PATCH", { permissions: null }), P({ id: ids.x0 })))).status).toBe(200);
      as("x0");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).toEqual(sorted("L_x0"));
    });

    it("an Agent given the Agency dashboard permission gets the agency's dashboard, and nothing else changes for them", async () => {
      as("admin");
      expect((await read(await (await R.user()).PATCH(req("/x", "PATCH", { permissions: ["dashboard.view"] }), P({ id: ids.x0 })))).status).toBe(200);
      as("x0");
      const d = await read(await (await R.dashboard()).GET(req("/api/dashboard")));
      expect(d.status).toBe(200);
      expect(d.body.totalLeads).toBe(await prisma.lead.count({ where: { organizationId: org1 } }));
      // their leads list is still only their own
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).toEqual(sorted("L_x0"));
      expect((await read(await (await R.users()).GET())).status).toBe(403);
    });

    it("a permission needs the ones it depends on: assigning leads brings seeing them", async () => {
      as("admin");
      await read(await (await R.user()).PATCH(req("/x", "PATCH", { permissions: ["leads.assign"] }), P({ id: ids.x0 })));
      const saved = await prisma.user.findUniqueOrThrow({ where: { id: ids.x0 } });
      expect(saved.permissions).toEqual(["leads.viewAll", "leads.assign"]);
      await read(await (await R.user()).PATCH(req("/x", "PATCH", { permissions: null }), P({ id: ids.x0 })));
    });

    it("rejects junk instead of saving it", async () => {
      as("admin");
      const { PATCH } = await R.user();
      expect((await read(await PATCH(req("/x", "PATCH", { permissions: "everything" }), P({ id: ids.x0 })))).status).toBe(400);
      const r = await read(await PATCH(req("/x", "PATCH", { permissions: ["made.up", "dashboard.view"] }), P({ id: ids.x0 })));
      expect(r.status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.x0 } })).permissions).toEqual(["dashboard.view"]);
      await PATCH(req("/x", "PATCH", { permissions: null }), P({ id: ids.x0 }));
    });
  });

  // ------------------------------------------------------------------------------ Changing teams
  describe("changing a team", () => {
    it("moving someone to another team moves what their manager sees", async () => {
      as("admin");
      expect((await read(await (await R.team()).PATCH(req("/x", "PATCH", { memberIds: [ids.a1, ids.a2, ids.x0] }), P({ id: team.A })))).status).toBe(200);
      as("mgrA");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).toEqual(expect.arrayContaining(sorted("L_x0")));
      as("admin");
      expect((await read(await (await R.team()).PATCH(req("/x", "PATCH", { memberIds: [ids.a1, ids.a2] }), P({ id: team.A })))).status).toBe(200);
      as("mgrA");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).not.toContain(lead.L_x0);
    });

    it("warns before a Manager would lose their team (and so see the whole agency), and only goes ahead when confirmed", async () => {
      as("admin");
      const { PATCH } = await R.team();
      const warn = await read(await PATCH(req("/x", "PATCH", { managerId: null }), P({ id: team.A })));
      expect(warn.status).toBe(409);
      expect(warn.body.needsConfirm).toBe(true);
      as("mgrA");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).toEqual(await leadsOf("a1", "a2", "mgrA")); // unchanged
      as("admin");
      expect((await read(await PATCH(req("/x", "PATCH", { managerId: null, confirm: true }), P({ id: team.A })))).status).toBe(200);
      as("mgrA");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body).length).toBe(await prisma.lead.count({ where: { organizationId: org1 } }));
      // put them back in charge
      as("admin");
      expect((await read(await PATCH(req("/x", "PATCH", { managerId: ids.mgrA }), P({ id: team.A })))).status).toBe(200);
      as("mgrA");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).toEqual(await leadsOf("a1", "a2", "mgrA"));
    });

    it("one manager can lead two teams and sees both", async () => {
      as("admin");
      const c = await read(await (await R.teams()).POST(req("/api/teams", "POST", { name: "Marketing", managerId: ids.mgrA, memberIds: [ids.x0] })));
      expect(c.status).toBe(201);
      team.M = c.body.team.id;
      as("mgrA");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).toEqual(await leadsOf("a1", "a2", "mgrA", "x0"));
      // removing the second team does not need a warning: they still have Team A
      as("admin");
      expect((await read(await (await R.team()).DELETE(req("/x", "DELETE"), P({ id: team.M })))).status).toBe(200);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: ids.x0 } })).toMatchObject({ teamId: null });
    });

    it("deleting a team that is its manager's only team asks first; people just leave it", async () => {
      as("admin");
      const { DELETE } = await R.team();
      expect((await read(await DELETE(req("/x", "DELETE"), P({ id: team.B })))).status).toBe(409);
      expect((await prisma.team.findUnique({ where: { id: team.B } }))?.id).toBe(team.B);
      expect((await read(await DELETE(req("/x", "DELETE", { confirm: true }), P({ id: team.B })))).status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.b1 } })).teamId).toBeNull();
    });

    it("a manager who stops being a Manager stops managing teams", async () => {
      as("admin");
      expect((await read(await (await R.user()).PATCH(req("/x", "PATCH", { role: "AGENT" }), P({ id: ids.mgrA })))).status).toBe(200);
      expect((await prisma.team.findUniqueOrThrow({ where: { id: team.A } })).managerId).toBeNull();
      as("mgrA");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).toEqual(sorted("L_mgrA")); // an Agent again: only their own
    });

    it("a deactivated person is locked out at once", async () => {
      as("admin");
      expect((await read(await (await R.user()).PATCH(req("/x", "PATCH", { status: "INACTIVE" }), P({ id: ids.a1 })))).status).toBe(200);
      as("a1");
      expect((await read(await (await R.leads()).GET(req("/api/leads")))).status).toBe(403);
    });
  });

  // ------------------------------------------------------------------------------------ Other agency
  describe("another agency", () => {
    it("never sees this agency's people, leads or listings, and this agency never sees theirs", async () => {
      as("z");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).toEqual([lead.L_z]);
      expect((await read(await (await R.lead()).GET(req("/x"), P({ id: lead.L_a2 })))).status).toBe(404);
      expect(listingIds((await read(await (await R.listings()).GET(req("/api/listings?pageSize=100")))).body)).toEqual([listing.S_z]);
      as("owner");
      expect(leadIds((await read(await (await R.leads()).GET(req("/api/leads")))).body)).not.toContain(lead.L_z);
      expect((await read(await (await R.listing()).GET(req("/x"), P({ id: String(listing.S_z) })))).status).toBe(404);
    });

    it("cannot be used to reach into this agency's teams or users", async () => {
      as("ownerZ");
      expect((await read(await (await R.team()).PATCH(req("/x", "PATCH", { name: "Taken over" }), P({ id: team.A })))).status).toBe(404);
      expect((await read(await (await R.team()).DELETE(req("/x", "DELETE", { confirm: true }), P({ id: team.A })))).status).toBe(404);
      expect((await read(await (await R.teams()).POST(req("/api/teams", "POST", { name: "Foreign", managerId: ids.mgrB, memberIds: [ids.a2] })))).status).toBe(400);
      expect((await read(await (await R.user()).PATCH(req("/x", "PATCH", { status: "INACTIVE" }), P({ id: ids.a2 })))).status).toBe(404);
      const names = ((await read(await (await R.users()).GET())).body.users as { id: string }[]).map((u) => u.id);
      expect(names).not.toContain(ids.a2);
    });
  });
});
