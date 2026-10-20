import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../prisma";
import { tenantDb } from "../tenant";

// Real-database test of the Leads list paging that the phone's endless scrolling uses. Needs a
// disposable Postgres:  RUN_TENANT_DB_TESTS=1 DATABASE_URL=postgresql://...test-db... npx vitest run lib/leads/paging
const run = process.env.RUN_TENANT_DB_TESTS === "1";

const current = vi.hoisted(() => ({ session: null as null | { user: { id: string; role: string } }, orgId: "" }));
vi.mock("@/lib/api-helpers", async () => {
  const { tenantDb } = await import("../tenant");
  const { fakeApiHelpers } = await import("../testing/apiHelpersMock");
  return fakeApiHelpers(() => current, tenantDb);
});

const get = async (query: string) => {
  const { GET } = await import("../../app/api/leads/route");
  const res = await GET(new NextRequest(`http://x.test/api/leads?${query}`));
  return (await res.json()) as { leads: { id: string; name: string }[]; nextCursor: string | null; total: number };
};

describe.skipIf(!run)("leads list paging (real database)", () => {
  const tag = `pg${Date.now()}`;
  let org = "";
  let admin = "";
  let ali = "";

  beforeAll(async () => {
    org = (await prisma.organization.create({ data: { name: "A", slug: `${tag}-a` } })).id;
    const mk = (n: string, role: "AGENT" | "ADMIN") => prisma.user.create({ data: { organizationId: org, name: n, email: `${tag}-${n}@x.test`, whatsapp: "1", passwordHash: "x", role } }).then((u) => u.id);
    admin = await mk("boss", "ADMIN");
    ali = await mk("ali", "AGENT");
    const { ensureStages } = await import("./stages");
    const stage = (await ensureStages(org))[0].id;
    // 25 leads; several share the same received time, which paging must not trip over
    const base = Date.now() - 3 * 3600_000;
    for (let i = 0; i < 25; i++) {
      await prisma.lead.create({ data: { organizationId: org, source: "MANUAL", externalId: `${tag}-${i}`, name: `Lead ${String(i).padStart(2, "0")}`, channel: "OTHER", stageId: stage, assignedToId: i % 5 === 0 ? ali : null, receivedAt: new Date(base + Math.floor(i / 3) * 60_000) } });
    }
  });

  afterAll(async () => {
    try {
      await prisma.lead.deleteMany({ where: { organizationId: org } });
      await prisma.leadStage.deleteMany({ where: { organizationId: org } });
      await prisma.user.deleteMany({ where: { organizationId: org } });
      await prisma.organization.deleteMany({ where: { id: org } });
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

  async function walk(query: string, limit: number) {
    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const r = await get(`limit=${limit}&${query}${cursor ? `&cursor=${cursor}` : ""}`);
      ids.push(...r.leads.map((l) => l.id));
      cursor = r.nextCursor;
      pages++;
    } while (cursor && pages < 20);
    return { ids, pages };
  }

  it("walking the pages returns every lead once, in order, and says when it ends", async () => {
    as(admin, "ADMIN");
    const first = await get("limit=10");
    expect(first.leads).toHaveLength(10);
    expect(first.total).toBe(25);
    expect(first.nextCursor).toBe(first.leads[9].id);
    const { ids, pages } = await walk("", 10);
    expect(pages).toBe(3);
    expect(ids).toHaveLength(25);
    expect(new Set(ids).size).toBe(25); // none repeated
    const last = await get(`limit=10&cursor=${ids[19]}`);
    expect(last.leads).toHaveLength(5);
    expect(last.nextCursor).toBeNull();
  });

  it("newest first by default, oldest first on request, and the two orders are exact opposites", async () => {
    as(admin, "ADMIN");
    const newest = (await walk("sort=newest", 7)).ids;
    const oldest = (await walk("sort=oldest", 7)).ids;
    expect(oldest).toEqual([...newest].reverse());
    const all = await prisma.lead.findMany({ where: { organizationId: org }, orderBy: [{ receivedAt: "desc" }, { id: "desc" }], select: { id: true } });
    expect(newest).toEqual(all.map((l) => l.id));
  });

  it("keeps the filter across pages, and an agent only ever pages through their own leads", async () => {
    as(admin, "ADMIN");
    expect((await walk("assignee=unassigned", 6)).ids).toHaveLength(20);
    as(ali, "AGENT");
    const mine = await walk("", 2);
    expect(mine.ids).toHaveLength(5);
    expect((await tenantDb(org).lead.count({ where: { id: { in: mine.ids }, assignedToId: ali } }))).toBe(5);
  });

  it("without a limit the latest 300 come at once (the desktop table), and a deleted cursor ends the list quietly", async () => {
    as(admin, "ADMIN");
    const all = await get("");
    expect(all.leads).toHaveLength(25);
    expect(all.nextCursor).toBeNull();
    const gone = await get("limit=10&cursor=does-not-exist");
    expect(gone.leads).toEqual([]);
    expect(gone.nextCursor).toBeNull();
  });
});
