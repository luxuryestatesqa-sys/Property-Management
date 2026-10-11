// Demo leads for trying out the Leads pages without waiting for real Property Finder
// enquiries. Every demo lead has an external id starting with "demo-" and the tag
// "demo", so they are easy to spot and remove.
//
//   npx tsx prisma/demo-leads.ts            add demo leads to every agency's listings
//   npx tsx prisma/demo-leads.ts --remove   delete all demo leads again
import { PrismaClient } from "@prisma/client";
import { ingestPropertyFinderLead } from "../lib/leads/ingest";
import { normalizePfLead, PfLeadLike } from "../lib/leads/pfMapping";

const prisma = new PrismaClient();

const PEOPLE = [
  ["Fatima Al-Kuwari", "+974 5550 1001"],
  ["James Walker", "+974 5550 1002"],
  ["Mohammed Saeed", "+974 5550 1003"],
  ["Priya Nair", "+974 5550 1004"],
  ["Khalid Ibrahim", "+974 5550 1005"],
  ["Sofia Rossi", "+974 5550 1006"],
  ["Ahmed Yusuf", "+974 5550 1007"],
  ["Elena Petrova", "+974 5550 1008"],
  ["Omar Haddad", "+974 5550 1009"],
  ["Nora Al-Thani", "+974 5550 1010"],
];

async function main() {
  if (process.argv.includes("--remove")) {
    const r = await prisma.lead.deleteMany({ where: { externalId: { startsWith: "demo-" } } });
    console.log(`Removed ${r.count} demo leads.`);
    return;
  }

  const orgs = await prisma.organization.findMany({ where: { status: "ACTIVE" } });
  let created = 0;
  for (const org of orgs) {
    const listings = await prisma.listing.findMany({ where: { organizationId: org.id, status: "ACTIVE" }, orderBy: { id: "asc" }, take: 6, select: { id: true } });
    const users = await prisma.user.findMany({ where: { organizationId: org.id, status: "ACTIVE" }, select: { id: true, pfPublicProfileId: true } });
    if (listings.length === 0) {
      console.log(`${org.name}: no listings, skipped`);
      continue;
    }
    const minutesAgo = [3, 18, 55, 190, 420, 1500, 2900, 5000, 8000, 12000];
    const channels = ["whatsapp", "call", "whatsapp", "email", "call", "whatsapp", "whatsapp", "call", "whatsapp", "email"];

    for (let i = 0; i < PEOPLE.length; i++) {
      const [name, phone] = PEOPLE[i];
      const listing = listings[i % listings.length];
      const linkedProfile = users.find((u) => u.pfPublicProfileId)?.pfPublicProfileId;
      const lead: PfLeadLike = {
        id: `demo-${org.slug}-${i + 1}`,
        entityType: i === 8 ? "project" : "listing",
        channel: channels[i],
        status: i % 4 === 0 ? "sent" : i % 4 === 1 ? "delivered" : i % 4 === 2 ? "read" : "replied",
        // lead 5 and 9 go to a Property Finder profile nobody here is linked to (-> falls back to the
        // listing owner, or the Unassigned inbox for the project lead)
        publicProfile: { id: i === 4 || i === 8 ? 999999 : linkedProfile ?? 999999 },
        sender: { name, contacts: [{ type: "phone", value: phone }, ...(channels[i] === "email" ? [{ type: "email", value: `${name.split(" ")[0].toLowerCase()}@example.com` }] : [])] },
        listing: i === 8 ? undefined : { id: `demo-pf-${i}`, reference: `LE-${listing.id}` },
        call: channels[i] === "call" ? { talkTime: 40 + i * 17, waitTime: 6 + i } : undefined,
        tags: ["demo"],
        createdAt: new Date(Date.now() - minutesAgo[i] * 60000).toISOString(),
      };
      const r = await ingestPropertyFinderLead(org.id, normalizePfLead(lead), lead);
      if (r.created) created++;
    }
    console.log(`${org.name}: demo leads ready`);
  }
  console.log(`Created ${created} new demo leads. Remove them with: npx tsx prisma/demo-leads.ts --remove`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
