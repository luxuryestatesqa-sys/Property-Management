import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function dupKey(area: string, community: string, buildingName: string, floor: string, apartmentNumber: string) {
  return [area, community, buildingName, floor, apartmentNumber]
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

async function main() {
  const adminPassword = await bcrypt.hash("Admin123!", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin@luxuryestates.qa" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@luxuryestates.qa",
      whatsapp: "+974 3000 0000",
      role: "ADMIN",
      status: "ACTIVE",
      passwordHash: adminPassword,
    },
  });

  const agentPassword = await bcrypt.hash("Agent123!", 10);
  const agentNames = ["Ahmed", "Bilal", "Fatima", "Sara", "Youssef"];
  const agents = [];
  for (let i = 0; i < agentNames.length; i++) {
    const name = agentNames[i];
    const email = `${name.toLowerCase()}@luxuryestates.qa`;
    const agent = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name,
        email,
        whatsapp: `+974 5${String(i + 1).padStart(3, "0")} 0000`,
        role: "AGENT",
        status: "ACTIVE",
        passwordHash: agentPassword,
      },
    });
    agents.push(agent);
  }

  const existingListings = await prisma.listing.count();
  if (existingListings === 0) {
    const sample = [
      {
        listingType: "SALE" as const,
        propertyCategory: "APARTMENT" as const,
        bedrooms: "TWO" as const,
        sizeSqm: 120,
        area: "Lusail",
        community: "Marina District",
        buildingName: "Marina Tower 5",
        floor: "12",
        apartmentNumber: "1204",
        salePrice: 1850000,
        rentalValue: 10000,
        furnished: "FURNISHED" as const,
        createdById: agents[0].id,
      },
      {
        listingType: "SALE" as const,
        propertyCategory: "APARTMENT" as const,
        bedrooms: "TWO" as const,
        sizeSqm: 122,
        area: "Lusail",
        community: "Marina District",
        buildingName: "Marina Tower 5",
        floor: "12",
        apartmentNumber: "1204",
        salePrice: 1900000,
        rentalValue: 10500,
        furnished: "FURNISHED" as const,
        createdById: agents[1].id,
      },
      {
        listingType: "RENT" as const,
        propertyCategory: "APARTMENT" as const,
        bedrooms: "ONE" as const,
        sizeSqm: 78,
        area: "The Pearl",
        community: "Porto Arabia",
        buildingName: "Tower 7",
        floor: "8",
        apartmentNumber: "804",
        rentPrice: 8000,
        furnished: "UNFURNISHED" as const,
        billsStatus: "INCLUDED" as const,
        availabilityStatus: "RESERVED" as const,
        createdById: agents[2].id,
      },
      {
        listingType: "RENT" as const,
        propertyCategory: "APARTMENT" as const,
        bedrooms: "THREE_PLUS_MAID" as const,
        sizeSqm: 195,
        area: "West Bay",
        community: "Diplomatic Area",
        buildingName: "Al Fardan Towers",
        floor: "20",
        apartmentNumber: "2005",
        rentPrice: 12500,
        furnished: "FURNISHED" as const,
        billsStatus: "EXCLUDED" as const,
        availabilityStatus: "RENTED" as const,
        createdById: agents[3].id,
      },
      {
        listingType: "SALE" as const,
        propertyCategory: "APARTMENT" as const,
        bedrooms: "STUDIO" as const,
        sizeSqm: 48,
        area: "The Pearl",
        community: "Viva Bahriya",
        buildingName: "Amwaj Tower",
        floor: "5",
        apartmentNumber: "502",
        salePrice: 2400000,
        furnished: "UNFURNISHED" as const,
        availabilityStatus: "SOLD" as const,
        createdById: agents[4].id,
      },
      {
        listingType: "RENT" as const,
        propertyCategory: "TOWNHOUSE" as const,
        bedrooms: "THREE" as const,
        sizeSqm: 240,
        area: "Lusail",
        community: "Fox Hills",
        buildingName: "Fox Hills Park View",
        floor: "3",
        apartmentNumber: "301",
        rentPrice: 6500,
        furnished: "FURNISHED" as const,
        billsStatus: "INCLUDED" as const,
        createdById: agents[0].id,
      },
      {
        listingType: "RENT" as const,
        propertyCategory: "OFFICE" as const,
        bedrooms: null,
        sizeSqm: 160,
        area: "West Bay",
        community: "Diplomatic Area",
        buildingName: "Tornado Tower",
        floor: "15",
        apartmentNumber: "1502",
        rentPrice: 18000,
        furnished: "UNFURNISHED" as const,
        billsStatus: "EXCLUDED" as const,
        createdById: agents[1].id,
      },
    ];

    for (const s of sample) {
      await prisma.listing.create({
        data: {
          ...s,
          dupKey: dupKey(s.area, s.community, s.buildingName, s.floor, s.apartmentNumber),
        },
      });
    }
  }

  // Feed-ready samples: unlike the block above (internal-use test data with
  // no photos/description), these have everything getChannelEligibility
  // requires (title, description, a photo, price, full location) and an
  // enabled PortalListing row for each pull-based channel, so
  // /feeds/{pf,qatarliving,oryx}.xml has real content to test against right
  // after a fresh seed. Skipped per-listing (by dupKey) rather than gated on
  // "no listings exist yet" like the block above, so re-running seed on an
  // already-seeded dev DB doesn't error or duplicate them.
  const PLACEHOLDER_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const feedSamples = [
    {
      listingType: "RENT" as const,
      propertyCategory: "APARTMENT" as const,
      bedrooms: "TWO" as const,
      bathrooms: "2",
      sizeSqm: 135,
      title: "Modern 2BR Apartment with Marina View",
      description: "Bright, fully furnished 2-bedroom apartment in Lusail Marina District with a full marina view, shared pool, and gym access.",
      area: "Lusail",
      community: "Marina District",
      buildingName: "Marina Tower 9",
      floor: "14",
      apartmentNumber: "1401",
      rentPrice: 9500,
      furnished: "FURNISHED" as const,
      billsStatus: "INCLUDED" as const,
      createdById: agents[0].id,
    },
    {
      listingType: "SALE" as const,
      propertyCategory: "VILLA" as const,
      bedrooms: "FOUR" as const,
      bathrooms: "5",
      sizeSqm: 420,
      title: "Spacious 4BR Villa in The Pearl",
      description: "Standalone 4-bedroom villa on Qanat Quartier with a private garden and covered parking for 2 cars, walking distance to the canal.",
      area: "The Pearl",
      community: "Qanat Quartier",
      buildingName: "Villa 27",
      floor: "-",
      apartmentNumber: "27",
      salePrice: 5200000,
      furnished: "UNFURNISHED" as const,
      createdById: agents[1].id,
    },
    {
      listingType: "RENT" as const,
      propertyCategory: "APARTMENT" as const,
      bedrooms: "ONE" as const,
      bathrooms: "1",
      sizeSqm: 72,
      title: "Cozy 1BR Apartment in West Bay",
      description: "Well-maintained 1-bedroom apartment in West Bay's Diplomatic Area, close to City Center and the Corniche, unfurnished with bills excluded.",
      area: "West Bay",
      community: "Diplomatic Area",
      buildingName: "Palm Towers",
      floor: "9",
      apartmentNumber: "905",
      rentPrice: 6000,
      furnished: "UNFURNISHED" as const,
      billsStatus: "EXCLUDED" as const,
      createdById: agents[2].id,
    },
  ];

  for (const s of feedSamples) {
    const key = dupKey(s.area, s.community, s.buildingName, s.floor, s.apartmentNumber);
    const existing = await prisma.listing.findFirst({ where: { dupKey: key } });
    if (existing) continue;

    const listing = await prisma.listing.create({
      data: {
        ...s,
        dupKey: key,
        images: { create: [{ url: PLACEHOLDER_IMAGE, sortOrder: 0 }] },
      },
    });

    await prisma.portalListing.createMany({
      data: (["WEBSITE", "QATAR_LIVING", "PROPERTY_ORYX"] as const).map((portal) => ({
        listingId: listing.id,
        portal,
        enabled: false,
      })),
    });
  }

  console.log("Seed complete.");
  console.log("Admin login: admin@luxuryestates.qa / Admin123!");
  console.log("Agent login example: ahmed@luxuryestates.qa / Agent123!");
  void admin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
