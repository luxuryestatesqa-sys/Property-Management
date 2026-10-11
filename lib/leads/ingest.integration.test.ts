import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../prisma";
import { tenantDb } from "../tenant";
import { ingestPropertyFinderLead } from "./ingest";
import { normalizePfLead } from "./pfMapping";
import crypto from "crypto";
import { NextRequest } from "next/server";

// Real-database test of lead intake. Needs a disposable Postgres (never production):
//   RUN_TENANT_DB_TESTS=1 DATABASE_URL=postgresql://...test-db... npx vitest run lib/leads
const run = process.env.RUN_TENANT_DB_TESTS === "1";

describe.skipIf(!run)("Property Finder lead intake (real database)", () => {
  const tag = `lead${Date.now()}`;
  let orgA = "";
  let orgB = "";
  let agentA = "";
  let ownerOnlyA = "";
  let listingA = 0;

  beforeAll(async () => {
    orgA = (await prisma.organization.create({ data: { name: "A", slug: `${tag}-a` } })).id;
    orgB = (await prisma.organization.create({ data: { name: "B", slug: `${tag}-b` } })).id;
    agentA = (await prisma.user.create({ data: { organizationId: orgA, name: "Agent A", email: `${tag}-a@x.test`, whatsapp: "1", passwordHash: "x", pfPublicProfileId: 777 } })).id;
    ownerOnlyA = (await prisma.user.create({ data: { organizationId: orgA, name: "Owner A", email: `${tag}-o@x.test`, whatsapp: "2", passwordHash: "x" } })).id;
    await prisma.user.create({ data: { organizationId: orgB, name: "Agent B", email: `${tag}-b@x.test`, whatsapp: "3", passwordHash: "x", pfPublicProfileId: 888 } });
    listingA = (
      await prisma.listing.create({
        data: { organizationId: orgA, createdById: ownerOnlyA, listingType: "RENT", propertyCategory: "APARTMENT", bedrooms: "TWO", area: "Lusail", community: "Marina District", buildingName: "T1", floor: "3", apartmentNumber: "301", dupKey: `${tag}|1`, rentPrice: 7000, furnished: "FURNISHED" },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      await prisma.lead.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
      await prisma.leadStage.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
      await prisma.listing.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
      await prisma.user.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
      await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    } catch {
      // best effort on a disposable database
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  });

  const lead = (id: string, extra: Record<string, unknown> = {}) =>
    normalizePfLead({ id, entityType: "listing", channel: "whatsapp", status: "sent", publicProfile: { id: 777 }, sender: { name: "Buyer", contacts: [{ type: "phone", value: "+97455500001" }] }, listing: { id: "pf1", reference: `LE-${listingA}` }, createdAt: "2026-10-01T10:00:00Z", ...extra });

  it("creates a lead, matches the agent by Property Finder profile and the region by listing", async () => {
    const r = await ingestPropertyFinderLead(orgA, lead("L1"));
    expect(r.created).toBe(true);
    const db = tenantDb(orgA);
    const stored = await db.lead.findFirstOrThrow({ where: { id: r.leadId }, include: { stage: true, activities: true } });
    expect(stored.assignedToId).toBe(agentA);
    expect(stored.listingId).toBe(listingA);
    expect(stored.region).toBe("Lusail → Marina District");
    expect(stored.stage.name).toBe("New");
    expect(stored.activities.map((a) => a.type).sort()).toEqual(["ASSIGNED", "RECEIVED"]);
  });

  it("is idempotent: the same external id never makes a second lead, and logs a status change", async () => {
    const again = await ingestPropertyFinderLead(orgA, lead("L1", { status: "replied" }));
    expect(again.created).toBe(false);
    const db = tenantDb(orgA);
    expect(await db.lead.count({ where: { externalId: "L1" } })).toBe(1);
    const stored = await db.lead.findFirstOrThrow({ where: { externalId: "L1" }, include: { activities: true } });
    expect(stored.pfStatus).toBe("replied");
    expect(stored.firstContactedAt).not.toBeNull();
    expect(stored.activities.some((a) => a.type === "PF_STATUS")).toBe(true);
  });

  it("falls back to the listing owner when the profile is not linked to anyone", async () => {
    const r = await ingestPropertyFinderLead(orgA, lead("L2", { publicProfile: { id: 99999 } }));
    const stored = await tenantDb(orgA).lead.findFirstOrThrow({ where: { id: r.leadId } });
    expect(stored.assignedToId).toBe(ownerOnlyA);
  });

  it("leaves a lead unassigned (inbox) when nobody matches", async () => {
    const r = await ingestPropertyFinderLead(orgA, normalizePfLead({ id: "L3", entityType: "project", channel: "email", publicProfile: { id: 12345 }, sender: { name: "X", contacts: [] } }));
    const stored = await tenantDb(orgA).lead.findFirstOrThrow({ where: { id: r.leadId }, include: { activities: true } });
    expect(stored.assignedToId).toBeNull();
    expect(stored.activities.some((a) => a.type === "UNASSIGNED")).toBe(true);
  });

  it("never touches stage or assignment a person already set", async () => {
    const db = tenantDb(orgA);
    const stages = await db.leadStage.findMany({ orderBy: { position: "asc" } });
    const l1 = await db.lead.findFirstOrThrow({ where: { externalId: "L1" } });
    await db.lead.update({ where: { id: l1.id }, data: { stageId: stages[2].id, assignedToId: ownerOnlyA } });
    await ingestPropertyFinderLead(orgA, lead("L1", { status: "read" }));
    const after = await db.lead.findFirstOrThrow({ where: { externalId: "L1" } });
    expect(after.stageId).toBe(stages[2].id);
    expect(after.assignedToId).toBe(ownerOnlyA);
  });

  it("keeps agencies apart: the same Property Finder lead id lives separately per agency and is invisible across", async () => {
    await ingestPropertyFinderLead(orgB, normalizePfLead({ id: "L1", channel: "call", publicProfile: { id: 888 }, sender: { name: "B buyer", contacts: [] } }));
    expect(await tenantDb(orgA).lead.count({ where: { externalId: "L1" } })).toBe(1);
    expect(await tenantDb(orgB).lead.count({ where: { externalId: "L1" } })).toBe(1);
    expect((await tenantDb(orgB).lead.findFirstOrThrow({ where: { externalId: "L1" } })).name).toBe("B buyer");
    expect(await tenantDb(orgB).leadStage.count()).toBe(6);
  });

  it("webhook: a signed lead.created is stored for the right agency; a bad signature is refused", async () => {
    const { POST } = await import("../../app/api/portals/propertyfinder/webhook/route");
    await prisma.portalCredential.create({ data: { organizationId: orgA, portal: "PROPERTY_FINDER", webhookSecret: "secret-A" } });
    const body = JSON.stringify({
      id: "evt-1",
      type: "lead.created",
      timestamp: "2026-10-05T08:30:00Z",
      entity: { id: "WH1", type: "lead" },
      payload: { channel: "whatsapp", status: "sent", entityType: "listing", publicProfile: { id: 777 }, sender: { name: "Hook Buyer", contacts: [{ type: "phone", value: "+9745550777" }] }, listing: { id: "pf1", reference: `LE-${listingA}` } },
    });
    const sign = (secret: string) => crypto.createHmac("sha256", secret).update(body).digest("hex");
    const call = (sig: string) => POST(new NextRequest(new URL("https://app.test/api/portals/propertyfinder/webhook"), { method: "POST", body, headers: { "x-signature": sig } }));

    expect((await call(sign("wrong-secret"))).status).toBe(401);
    expect(await tenantDb(orgA).lead.count({ where: { externalId: "WH1" } })).toBe(0);

    expect((await call(sign("secret-A"))).status).toBe(200);
    const stored = await tenantDb(orgA).lead.findFirstOrThrow({ where: { externalId: "WH1" } });
    expect(stored.name).toBe("Hook Buyer");
    expect(stored.assignedToId).toBe(agentA);
    expect(stored.receivedAt.toISOString()).toBe("2026-10-05T08:30:00.000Z");

    // a retry (at-least-once delivery) must not duplicate it
    expect((await call(sign("secret-A"))).status).toBe(200);
    expect(await tenantDb(orgA).lead.count({ where: { externalId: "WH1" } })).toBe(1);
    await prisma.portalCredential.deleteMany({ where: { organizationId: orgA } });
  });

  it("rules: a region rule beats the Property Finder profile and listing owner, and an off rule is ignored", async () => {
    const db = tenantDb(orgA);
    const rule = await db.assignmentRule.create({ data: { organizationId: orgA, name: "Lusail to owner", kind: "REGION", matchText: "lusail", agentIds: [ownerOnlyA], position: 0 } });
    const r = await ingestPropertyFinderLead(orgA, lead("R1")); // profile 777 -> agentA, region contains Lusail
    expect((await db.lead.findFirstOrThrow({ where: { id: r.leadId } })).assignedToId).toBe(ownerOnlyA);

    await db.assignmentRule.update({ where: { id: rule.id }, data: { active: false } });
    const r2 = await ingestPropertyFinderLead(orgA, lead("R2"));
    expect((await db.lead.findFirstOrThrow({ where: { id: r2.leadId } })).assignedToId).toBe(agentA);
    await db.assignmentRule.deleteMany({});
  });

  it("rules: sharing across agents hands the next lead to the least busy one", async () => {
    const db = tenantDb(orgA);
    await db.assignmentRule.create({ data: { organizationId: orgA, name: "Share", kind: "ROUND_ROBIN", agentIds: [agentA, ownerOnlyA], position: 0 } });
    const openBefore = await db.lead.count({ where: { assignedToId: agentA, stage: { kind: "OPEN" } } });
    const openOwner = await db.lead.count({ where: { assignedToId: ownerOnlyA, stage: { kind: "OPEN" } } });
    const r = await ingestPropertyFinderLead(orgA, lead("R3", { publicProfile: { id: 12345 } }));
    const got = (await db.lead.findFirstOrThrow({ where: { id: r.leadId } })).assignedToId;
    expect(got).toBe(openBefore <= openOwner ? agentA : ownerOnlyA);
    await db.assignmentRule.deleteMany({});
  });

  it("rules: applying them to the Unassigned inbox assigns waiting leads and logs it", async () => {
    const { applyRulesToUnassigned } = await import("./rules");
    const db = tenantDb(orgA);
    const waiting = await ingestPropertyFinderLead(orgA, normalizePfLead({ id: "R4", entityType: "project", channel: "email", publicProfile: { id: 424242 }, sender: { name: "Waiting", contacts: [] } }));
    expect((await db.lead.findFirstOrThrow({ where: { id: waiting.leadId } })).assignedToId).toBeNull();
    await db.assignmentRule.create({ data: { organizationId: orgA, name: "Catch all", kind: "ROUND_ROBIN", agentIds: [agentA], position: 0 } });
    const res = await applyRulesToUnassigned(orgA, ownerOnlyA);
    expect(res.assigned).toBeGreaterThanOrEqual(1);
    const after = await db.lead.findFirstOrThrow({ where: { id: waiting.leadId }, include: { activities: true } });
    expect(after.assignedToId).toBe(agentA);
    expect(after.activities.some((a) => a.type === "ASSIGNED" && a.text?.includes("Catch all"))).toBe(true);
    await db.assignmentRule.deleteMany({});
  });

  it("rules never cross agencies", async () => {
    await tenantDb(orgA).assignmentRule.create({ data: { organizationId: orgA, name: "A only", kind: "ROUND_ROBIN", agentIds: [agentA], position: 0 } });
    expect(await tenantDb(orgB).assignmentRule.count()).toBe(0);
    await tenantDb(orgA).assignmentRule.deleteMany({});
  });
});
