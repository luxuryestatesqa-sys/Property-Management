// Fills a DISPOSABLE database with a small agency (people in different roles, two teams, leads and listings) so
// scripts/e2e-browser.mjs can sign in and click through the app. Never run it against production.
//
//   DATABASE_URL=postgresql://...test-db... npx tsx scripts/e2e-seed.ts
//
// Every person's password is "Passw0rd!". Running it again replaces the same agency.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TEAM_MANAGER_PERMISSIONS } from "../lib/teamManagerPermissions";

const prisma = new PrismaClient();
const SLUG = "e2e-ui";
export const PASSWORD = "Passw0rd!";

async function main() {
  const old = await prisma.organization.findUnique({ where: { slug: SLUG } });
  if (old) {
    const where = { organizationId: old.id };
    await prisma.viewing.deleteMany({ where });
    await prisma.leadTask.deleteMany({ where });
    await prisma.leadActivity.deleteMany({ where });
    await prisma.lead.deleteMany({ where });
    await prisma.activity.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where: { listing: where } });
    await prisma.listing.deleteMany({ where });
    await prisma.team.deleteMany({ where });
    await prisma.leadStage.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.organization.delete({ where: { id: old.id } });
  }

  const org = await prisma.organization.create({ data: { name: "E2E Agency", slug: SLUG } });
  const passwordHash = await bcrypt.hash(PASSWORD, 8);
  const person = async (key: string, role: "OWNER" | "ADMIN" | "MANAGER" | "AGENT") =>
    (await prisma.user.create({ data: { organizationId: org.id, name: `${key.toUpperCase()} Person`, email: `${key}@e2e.test`, whatsapp: "+97450000000", passwordHash, role } })).id;

  const id: Record<string, string> = {};
  for (const [k, r] of [["owner", "OWNER"], ["admin", "ADMIN"], ["mgra", "MANAGER"], ["mgrb", "MANAGER"], ["mgrl", "MANAGER"], ["a1", "AGENT"], ["a2", "AGENT"], ["b1", "AGENT"], ["x0", "AGENT"]] as const) id[k] = await person(k, r);

  const stage = await prisma.leadStage.create({ data: { organizationId: org.id, name: "New", position: 0, kind: "OPEN" } });
  await prisma.leadStage.create({ data: { organizationId: org.id, name: "Contacted", position: 1, kind: "OPEN" } });

  const teamA = await prisma.team.create({ data: { organizationId: org.id, name: "Sales Team A", managerId: id.mgra } });
  const teamB = await prisma.team.create({ data: { organizationId: org.id, name: "Sales Team B", managerId: id.mgrb } });
  await prisma.user.updateMany({ where: { id: { in: [id.a1, id.a2] } }, data: { teamId: teamA.id } });
  await prisma.user.updateMany({ where: { id: { in: [id.b1] } }, data: { teamId: teamB.id } });
  // what creating the teams through the app would give their managers
  await prisma.user.updateMany({ where: { id: { in: [id.mgra, id.mgrb] } }, data: { permissions: TEAM_MANAGER_PERMISSIONS } });

  for (const [name, who] of [["Lead A1", "a1"], ["Lead A2", "a2"], ["Lead B1", "b1"], ["Lead X0", "x0"], ["Lead Unassigned", null]] as const) {
    await prisma.lead.create({ data: { organizationId: org.id, source: "MANUAL", externalId: `e2e-${name}`, name, channel: "WHATSAPP", receivedAt: new Date(), stageId: stage.id, assignedToId: who ? id[who] : null } });
  }
  for (const [n, by, vis] of [["SharedA1", "a1", "SHARED"], ["PrivateA1", "a1", "PRIVATE"], ["SharedB1", "b1", "SHARED"], ["PrivateB1", "b1", "PRIVATE"]] as const) {
    await prisma.listing.create({
      data: {
        organizationId: org.id, createdById: id[by], listingType: "RENT", propertyCategory: "APARTMENT", bedrooms: "TWO", area: "Doha", community: "West Bay",
        buildingName: `Tower ${n}`, floor: "3", apartmentNumber: n, dupKey: `e2e|${n}`, rentPrice: 7000, furnished: "FURNISHED", visibility: vis, ownerName: "Secret Owner",
        images: { create: [{ url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", sortOrder: 0 }] },
      },
    });
  }
  console.log("Seeded E2E Agency. Sign in as owner@, admin@, mgra@, mgrb@, mgrl@, a1@, a2@, b1@, x0@ e2e.test with password", PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
