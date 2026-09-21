import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { listingCreateSchema } from "@/lib/validation";
import { buildDupKey } from "@/lib/dupKey";
import { Prisma, PropertyCategory, BedroomCount } from "@prisma/client";

const PAGE_SIZE = 30;

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const listingType = sp.get("listingType"); // RENT | SALE | ALL
  const area = sp.get("area");
  const community = sp.get("community");
  const buildingName = sp.get("building");
  const rentMin = sp.get("rentMin");
  const rentMax = sp.get("rentMax");
  const saleMin = sp.get("saleMin");
  const saleMax = sp.get("saleMax");
  const furnished = sp.get("furnished"); // FURNISHED | UNFURNISHED | ALL
  const bills = sp.get("bills"); // INCLUDED | EXCLUDED | ALL
  const agentId = sp.get("agentId");
  const status = sp.get("status"); // ACTIVE | INACTIVE | ALL
  const availability = sp.get("availability"); // AVAILABLE | RESERVED | RENTED | SOLD | ALL
  const propertyCategory = sp.get("propertyCategory");
  const bedrooms = sp.get("bedrooms");
  const page = Math.max(1, Number(sp.get("page") ?? "1"));
  const mine = sp.get("mine"); // "1" -> only current user's listings

  const conditions: Prisma.ListingWhereInput[] = [];

  // Non-admins never see other agents' inactive listings via the main search unless it's their own (mine=1)
  if (mine === "1") {
    conditions.push({ createdById: session!.user.id });
    if (status === "ACTIVE" || status === "INACTIVE") {
      conditions.push({ status });
    }
  } else if (session!.user.role === "ADMIN") {
    if (status === "ACTIVE" || status === "INACTIVE") {
      conditions.push({ status });
    }
    // admin with no status filter sees all statuses on the main search
  } else {
    // Agents only ever browse ACTIVE company listings on the main search;
    // their own inactive listings are managed via My Listings (mine=1).
    conditions.push({ status: "ACTIVE" });
  }

  if (listingType === "RENT" || listingType === "SALE") {
    conditions.push({ listingType });
  }
  if (area) conditions.push({ area: { equals: area } });
  if (community) conditions.push({ community: { equals: community } });
  if (buildingName) conditions.push({ buildingName: { equals: buildingName } });
  if (furnished === "FURNISHED" || furnished === "UNFURNISHED") {
    conditions.push({ furnished });
  }
  if (bills === "INCLUDED" || bills === "EXCLUDED") {
    conditions.push({ billsStatus: bills });
  }
  if (agentId) conditions.push({ createdById: agentId });
  if (availability === "AVAILABLE" || availability === "RESERVED" || availability === "RENTED" || availability === "SOLD") {
    conditions.push({ availabilityStatus: availability });
  }
  if (propertyCategory && (Object.values(PropertyCategory) as string[]).includes(propertyCategory)) {
    conditions.push({ propertyCategory: propertyCategory as PropertyCategory });
  }
  if (bedrooms && (Object.values(BedroomCount) as string[]).includes(bedrooms)) {
    conditions.push({ bedrooms: bedrooms as BedroomCount });
  }

  if (rentMin) conditions.push({ rentPrice: { gte: Number(rentMin) } });
  if (rentMax) conditions.push({ rentPrice: { lte: Number(rentMax) } });
  if (saleMin) conditions.push({ salePrice: { gte: Number(saleMin) } });
  if (saleMax) conditions.push({ salePrice: { lte: Number(saleMax) } });

  if (q) {
    const digits = q.replace(/\D/g, "");
    const orConds: Prisma.ListingWhereInput[] = [
      { area: { contains: q } },
      { community: { contains: q } },
      { buildingName: { contains: q } },
      { apartmentNumber: { contains: q } },
      { floor: { contains: q } },
      { createdBy: { name: { contains: q } } },
    ];
    if (digits) {
      const idNum = Number(digits);
      if (!Number.isNaN(idNum)) orConds.push({ id: idNum });
    }
    conditions.push({ OR: orConds });
  }

  const finalWhere: Prisma.ListingWhereInput = { AND: conditions };

  const [total, listings] = await Promise.all([
    prisma.listing.count({ where: finalWhere }),
    prisma.listing.findMany({
      where: finalWhere,
      include: {
        createdBy: { select: { id: true, name: true, whatsapp: true, avatarUrl: true } },
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true, url: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return NextResponse.json({
    listings,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const parsed = listingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const dupKey = buildDupKey(data.area, data.community, data.buildingName, data.floor, data.apartmentNumber);

  if (!data.confirmDuplicate) {
    const existing = await prisma.listing.findMany({
      where: { dupKey, status: "ACTIVE" },
      include: {
        createdBy: { select: { id: true, name: true, whatsapp: true, avatarUrl: true } },
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true, url: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    if (existing.length > 0) {
      return NextResponse.json({ duplicate: true, existing }, { status: 200 });
    }
  }

  const listing = await prisma.listing.create({
    data: {
      listingType: data.listingType,
      propertyCategory: data.propertyCategory,
      bedrooms: data.bedrooms ?? null,
      sizeSqm: data.sizeSqm ?? null,
      area: data.area,
      community: data.community,
      buildingName: data.buildingName,
      floor: data.floor,
      apartmentNumber: data.apartmentNumber,
      dupKey,
      rentPrice: data.listingType === "RENT" ? data.rentPrice : null,
      salePrice: data.listingType === "SALE" ? data.salePrice : null,
      rentalValue: data.listingType === "SALE" ? data.rentalValue ?? null : null,
      furnished: data.furnished,
      billsStatus: data.billsStatus,
      createdById: session!.user.id,
    },
  });

  if (data.images && data.images.length > 0) {
    await prisma.listingImage.createMany({
      data: data.images.map((url, index) => ({ listingId: listing.id, url, sortOrder: index })),
    });
  }

  await prisma.auditLog.create({
    data: {
      listingId: listing.id,
      userId: session!.user.id,
      action: "CREATED",
      newValue: "Listing created",
    },
  });

  const created = await prisma.listing.findUnique({
    where: { id: listing.id },
    include: {
      createdBy: { select: { id: true, name: true, whatsapp: true, avatarUrl: true } },
      images: { orderBy: { sortOrder: "asc" }, select: { id: true, url: true } },
    },
  });

  return NextResponse.json({ duplicate: false, listing: created }, { status: 201 });
}
