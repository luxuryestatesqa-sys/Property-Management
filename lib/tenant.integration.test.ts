import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "./prisma";
import { tenantDb } from "./tenant";

// Cross-agency isolation, tested against a REAL database (not mocks): agency A
// must never be able to read, change, delete or attach anything to agency B's
// data through the tenant-scoped client. Skipped unless RUN_TENANT_DB_TESTS=1,
// because it needs a disposable Postgres - never point it at production:
//   RUN_TENANT_DB_TESTS=1 DATABASE_URL=postgresql://...test-db... npm test
const run = process.env.RUN_TENANT_DB_TESTS === "1";

describe.skipIf(!run)("tenant isolation (real database)", () => {
  const tag = `iso${Date.now()}`;
  let orgA = "";
  let orgB = "";
  let listingA = 0;
  let listingB = 0;
  let userA = "";
  let userB = "";

  const listingData = (organizationId: string, createdById: string, n: string) => ({
    organizationId,
    createdById,
    listingType: "RENT" as const,
    propertyCategory: "APARTMENT" as const,
    bedrooms: "TWO" as const,
    area: "Doha",
    community: "West Bay",
    buildingName: `Tower ${n}`,
    floor: "3",
    apartmentNumber: "301",
    dupKey: `${tag}|${n}`,
    rentPrice: 7000,
    furnished: "FURNISHED" as const,
  });

  beforeAll(async () => {
    const a = await prisma.organization.create({ data: { name: "Agency A", slug: `${tag}-a` } });
    const b = await prisma.organization.create({ data: { name: "Agency B", slug: `${tag}-b` } });
    orgA = a.id;
    orgB = b.id;
    userA = (await prisma.user.create({ data: { organizationId: orgA, name: "A", email: `${tag}-a@x.test`, whatsapp: "1", passwordHash: "x", role: "ADMIN" } })).id;
    userB = (await prisma.user.create({ data: { organizationId: orgB, name: "B", email: `${tag}-b@x.test`, whatsapp: "2", passwordHash: "x", role: "ADMIN" } })).id;
    listingA = (await prisma.listing.create({ data: { ...listingData(orgA, userA, "A"), images: { create: [{ url: "data:image/png;base64,AA", sortOrder: 0 }] } } })).id;
    listingB = (await prisma.listing.create({ data: { ...listingData(orgB, userB, "B"), images: { create: [{ url: "data:image/png;base64,BB", sortOrder: 0 }] } } })).id;
    await prisma.portalCredential.create({ data: { organizationId: orgA, portal: "PROPERTY_FINDER", apiKey: "key-A" } });
    await prisma.portalCredential.create({ data: { organizationId: orgB, portal: "PROPERTY_FINDER", apiKey: "key-B" } });
  });

  afterAll(async () => {
    try {
      await prisma.portalCredential.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
      await prisma.auditLog.deleteMany({ where: { listingId: { in: [listingA, listingB] } } });
      await prisma.listing.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
      await prisma.user.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
      await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    } catch {
      // Best-effort cleanup on a disposable test database (some lightweight
      // Postgres servers drop the connection after the deliberate
      // constraint-violation check above).
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  });

  it("lists only the agency's own listings, users and credentials", async () => {
    const a = tenantDb(orgA);
    expect((await a.listing.findMany()).map((l) => l.id)).toEqual([listingA]);
    expect((await a.user.findMany()).map((u) => u.id)).toEqual([userA]);
    const creds = await a.portalCredential.findMany();
    expect(creds).toHaveLength(1);
    expect(creds[0].apiKey).toBe("key-A");
  });

  it("cannot read another agency's listing by id", async () => {
    const a = tenantDb(orgA);
    expect(await a.listing.findUnique({ where: { id: listingB } })).toBeNull();
    expect(await a.listing.findFirst({ where: { id: listingB } })).toBeNull();
    await expect(a.listing.findUniqueOrThrow({ where: { id: listingB } })).rejects.toThrow();
  });

  it("cannot update or delete another agency's listing", async () => {
    const a = tenantDb(orgA);
    await expect(a.listing.update({ where: { id: listingB }, data: { rentPrice: 1 } })).rejects.toThrow();
    expect((await a.listing.updateMany({ where: { id: listingB }, data: { rentPrice: 1 } })).count).toBe(0);
    await expect(a.listing.delete({ where: { id: listingB } })).rejects.toThrow();
    expect((await a.listing.deleteMany({ where: { id: listingB } })).count).toBe(0);
    const stillThere = await prisma.listing.findUnique({ where: { id: listingB } });
    expect(stillThere?.rentPrice).toBe(7000);
  });

  it("scopes counts and aggregates", async () => {
    const a = tenantDb(orgA);
    expect(await a.listing.count()).toBe(1);
    expect((await a.listing.aggregate({ _count: true }))._count).toBe(1);
    expect(await a.listing.count({ where: { id: listingB } })).toBe(0);
  });

  it("stamps the agency on create and blocks writing into another agency", async () => {
    const a = tenantDb(orgA);
    const made = await a.listing.create({ data: listingData(orgA, userA, "A2") });
    expect(made.organizationId).toBe(orgA);
    await expect(a.listing.create({ data: listingData(orgB, userB, "evil") })).rejects.toThrow(/Cross-organization/);
    await expect(a.user.create({ data: { organizationId: orgB, name: "x", email: `${tag}-evil@x.test`, whatsapp: "9", passwordHash: "x" } })).rejects.toThrow(/Cross-organization/);
    await prisma.listing.delete({ where: { id: made.id } });
  });

  it("scopes child tables through their listing", async () => {
    const a = tenantDb(orgA);
    const imgs = await a.listingImage.findMany();
    expect(imgs).toHaveLength(1);
    expect(imgs[0].url).toContain("AA");
    // cannot attach an audit entry / image / portal state to another agency's listing
    await expect(a.auditLog.create({ data: { listingId: listingB, userId: userA, action: "EVIL" } })).rejects.toThrow(/Cross-organization/);
    await expect(a.listingImage.create({ data: { listingId: listingB, url: "x" } })).rejects.toThrow(/Cross-organization/);
    await expect(a.portalListing.upsert({ where: { listingId_portal: { listingId: listingB, portal: "WEBSITE" } }, update: {}, create: { listingId: listingB, portal: "WEBSITE" } })).rejects.toThrow(/Cross-organization/);
    // and can on its own
    await a.auditLog.create({ data: { listingId: listingA, userId: userA, action: "OK" } });
    expect(await a.auditLog.count()).toBeGreaterThanOrEqual(1);
    expect(await tenantDb(orgB).auditLog.count()).toBe(0);
  });

  it("allows the same portal credential for different agencies, but only one per agency", async () => {
    const b = await tenantDb(orgB).portalCredential.findFirst({ where: { portal: "PROPERTY_FINDER" } });
    expect(b?.apiKey).toBe("key-B");
    // A second row for the same (agency, portal) violates the unique constraint.
    await expect(prisma.portalCredential.create({ data: { organizationId: orgA, portal: "PROPERTY_FINDER" } })).rejects.toThrow();
  });
});
