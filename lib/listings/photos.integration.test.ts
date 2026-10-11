import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "../prisma";
import { tenantDb } from "../tenant";

// Real-database test of listing photos: the 25 limit, adding in batches, keeping / reordering /
// removing by id, and photo links instead of embedded photos. Needs a disposable Postgres:
//   RUN_TENANT_DB_TESTS=1 DATABASE_URL=postgresql://...test-db... npx vitest run lib/listings/photos
const run = process.env.RUN_TENANT_DB_TESTS === "1";

const current = vi.hoisted(() => ({ session: null as null | { user: { id: string; role: string } }, orgId: "" }));
vi.mock("@/lib/api-helpers", async () => {
  const { tenantDb } = await import("../tenant");
  return {
    requireSession: async () => ({ session: current.session as never, db: tenantDb(current.orgId), orgId: current.orgId, error: null }),
    parseJsonBody: async (req: NextRequest) => ({ value: await req.json(), error: null }),
  };
});

const photo = (tag: string) => `data:image/jpeg;base64,${Buffer.from(`photo-${tag}`).toString("base64")}`;
const json = (method: string, body?: unknown) => new NextRequest("http://x.test/api", { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "Content-Type": "application/json" } });

describe.skipIf(!run)("listing photos (real database)", () => {
  const tag = `ph${Date.now()}`;
  let org = "";
  let owner = "";
  let other = "";
  let listingId = 0;
  const ctx = () => ({ params: Promise.resolve({ id: String(listingId) }) });

  const as = (id: string, role = "AGENT") => {
    current.session = { user: { id, role } };
    current.orgId = org;
  };
  const rows = () => tenantDb(org).listingImage.findMany({ where: { listingId }, orderBy: { sortOrder: "asc" } });
  const append = async (images: string[], extra: object = {}) => {
    const { POST } = await import("../../app/api/listings/[id]/images/route");
    const res = await POST(json("POST", { images, ...extra }), ctx());
    return { status: res.status, body: await res.json() };
  };
  const patch = async (images: unknown[]) => {
    const { PATCH } = await import("../../app/api/listings/[id]/route");
    const res = await PATCH(json("PATCH", { images }), ctx());
    return { status: res.status, body: await res.json() };
  };

  beforeAll(async () => {
    org = (await prisma.organization.create({ data: { name: "A", slug: `${tag}-a` } })).id;
    const mk = (n: string) => prisma.user.create({ data: { organizationId: org, name: n, email: `${tag}-${n}@x.test`, whatsapp: "1", passwordHash: "x", role: "AGENT" } }).then((u) => u.id);
    owner = await mk("owner");
    other = await mk("other");
    listingId = (
      await prisma.listing.create({
        data: { organizationId: org, createdById: owner, listingType: "RENT", propertyCategory: "APARTMENT", bedrooms: "TWO", area: "Lusail", community: "Marina", buildingName: "T1", floor: "3", apartmentNumber: "301", dupKey: `${tag}|1`, rentPrice: 7000, furnished: "FURNISHED" },
      })
    ).id;
    await prisma.listingImage.createMany({ data: [photo("a"), photo("b"), photo("c")].map((url, sortOrder) => ({ listingId, url, sortOrder })) });
  });

  afterAll(async () => {
    try {
      await prisma.listingImage.deleteMany({ where: { listingId } });
      await prisma.auditLog.deleteMany({ where: { listingId } });
      await prisma.listing.deleteMany({ where: { organizationId: org } });
      await prisma.user.deleteMany({ where: { organizationId: org } });
      await prisma.organization.deleteMany({ where: { id: org } });
    } catch {
      // best effort on a disposable database
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  });

  it("the listing sends photo links, not the photos themselves", async () => {
    as(owner);
    const { GET } = await import("../../app/api/listings/[id]/route");
    const body = await (await GET(json("GET"), ctx())).json();
    expect(body.listing.images).toHaveLength(3);
    for (const img of body.listing.images) {
      expect(img.url).toMatch(new RegExp(`^/api/listings/${listingId}/images/${img.id}\\.jpg\\?v=\\d+$`));
      expect(img.url).not.toContain("base64");
    }
  });

  it("adds photos to the end in batches and says which id each got", async () => {
    as(owner);
    const r = await append([photo("d"), photo("e")]);
    expect(r.status).toBe(201);
    expect(r.body.images).toHaveLength(2);
    const all = await rows();
    expect(all.map((x) => x.sortOrder)).toEqual([0, 1, 2, 3, 4]);
    expect(all[3].id).toBe(r.body.images[0].id);
    expect(all[4].id).toBe(r.body.images[1].id);
  });

  it("keeps photos by id, reorders them, removes the rest and adds a new one - in one small request", async () => {
    as(owner);
    const before = await rows();
    const [a, b, c, d, e] = before;
    const res = await patch([{ id: e.id }, photo("new"), { id: a.id }, { id: d.id }]); // drops b and c
    expect(res.status).toBe(200);
    const after = await rows();
    expect(after).toHaveLength(4);
    expect([after[0].id, after[2].id, after[3].id]).toEqual([e.id, a.id, d.id]);
    expect(after[1].url).toBe(photo("new"));
    expect(after.map((x) => x.sortOrder)).toEqual([0, 1, 2, 3]);
    expect(after.some((x) => x.id === b.id || x.id === c.id)).toBe(false);
    expect(res.body.listing.images.map((i: { id: string }) => i.id)).toEqual(after.map((x) => x.id));
    expect(await tenantDb(org).auditLog.count({ where: { listingId, action: "PHOTOS_CHANGED" } })).toBeGreaterThan(0);
  });

  it("refuses a photo that isn't on the listing, a repeated one, and an empty list", async () => {
    as(owner);
    const [first] = await rows();
    expect((await patch([{ id: "someone-elses-photo" }])).status).toBe(409);
    expect((await patch([{ id: first.id }, { id: first.id }])).status).toBe(409);
    expect((await patch([])).status).toBe(400);
    expect(await rows()).toHaveLength(4); // nothing changed
  });

  it("stops at 25 photos, and drops being edited out don't count against the limit", async () => {
    as(owner);
    const have = await rows();
    const room = 25 - have.length;
    expect((await append(Array.from({ length: room }, (_, i) => photo(`fill${i}`)))).status).toBe(201);
    expect(await rows()).toHaveLength(25);
    expect((await append([photo("26th")])).status).toBe(400);
    // swapping: the 4 about to be dropped are ignored while the 4 new ones are added
    const dropIds = (await rows()).slice(0, 4).map((x) => x.id);
    expect((await append(Array.from({ length: 4 }, (_, i) => photo(`swap${i}`)), { ignoreIds: dropIds })).status).toBe(201);
    const keep = (await rows()).filter((x) => !dropIds.includes(x.id));
    expect((await patch(keep.map((x) => ({ id: x.id })))).status).toBe(200);
    expect(await rows()).toHaveLength(25);
    // an edit that lists more than 25 is refused outright
    expect((await patch(Array.from({ length: 26 }, (_, i) => photo(`x${i}`)))).status).toBe(400);
  });

  it("only the listing's agent or an admin can add photos; the feed's updated time moves", async () => {
    as(other);
    expect((await append([photo("sneaky")])).status).toBe(403);
    as(owner);
    const { id } = (await rows())[0];
    await patch([{ id }]); // trim to one so there is room
    const stamp = (await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).updatedAt.getTime();
    await new Promise((r) => setTimeout(r, 20));
    expect((await append([photo("later")])).status).toBe(201);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).updatedAt.getTime()).toBeGreaterThan(stamp);
    as(other, "ADMIN");
    expect((await append([photo("admin")])).status).toBe(201);
  });
});
