import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { listingCreateSchema } from "@/lib/validation";
import { buildDupKey } from "@/lib/dupKey";
import { redactPrivateFieldsList } from "@/lib/listingPrivacy";
import { parseBedroomKeywords, parseBareBedroomQuery } from "@/lib/searchKeywords";
import { Prisma, PropertyCategory, BedroomCount } from "@prisma/client";

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  // Callers (e.g. the infinite-scrolling properties list) can request a
  // smaller page size; other callers keep the existing default untouched.
  const requestedPageSize = Number(sp.get("pageSize"));
  const pageSize =
    Number.isFinite(requestedPageSize) && requestedPageSize > 0
      ? Math.min(Math.floor(requestedPageSize), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
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
  if (area) conditions.push({ area: { equals: area, mode: "insensitive" } });
  if (community) conditions.push({ community: { equals: community, mode: "insensitive" } });
  if (buildingName) conditions.push({ buildingName: { equals: buildingName, mode: "insensitive" } });
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
    // A query that's nothing but a bedroom expression ("2", "two", "studio",
    // "3bhk + maid") means only that - a bare "2" should show every
    // 2-bedroom listing, not also every listing whose floor, apartment
    // number, or ID happens to contain the digit "2".
    const bareBedroomMatches = parseBareBedroomQuery(q);
    if (bareBedroomMatches) {
      conditions.push({ bedrooms: { in: bareBedroomMatches } });
    } else {
      const digits = q.replace(/\D/g, "");
      const orConds: Prisma.ListingWhereInput[] = [
        { area: { contains: q, mode: "insensitive" } },
        { community: { contains: q, mode: "insensitive" } },
        { buildingName: { contains: q, mode: "insensitive" } },
        { apartmentNumber: { contains: q, mode: "insensitive" } },
        { floor: { contains: q, mode: "insensitive" } },
        { createdBy: { name: { contains: q, mode: "insensitive" } } },
      ];
      if (digits) {
        const idNum = Number(digits);
        if (!Number.isNaN(idNum)) orConds.push({ id: idNum });
      }
      // Lets "lusail 2br" surface matching listings by bedroom count too,
      // alongside the usual text hits, when the query is more than just a
      // bare bedroom expression.
      const bedroomMatches = parseBedroomKeywords(q);
      if (bedroomMatches.length > 0) {
        orConds.push({ bedrooms: { in: bedroomMatches } });
      }
      conditions.push({ OR: orConds });
    }
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
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const isAdmin = session!.user.role === "ADMIN";
  return NextResponse.json({
    listings: redactPrivateFieldsList(listings, session!.user.id, isAdmin),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
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
      const isAdmin = session!.user.role === "ADMIN";
      return NextResponse.json(
        { duplicate: true, existing: redactPrivateFieldsList(existing, session!.user.id, isAdmin) },
        { status: 200 }
      );
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
      // Bills included/excluded only makes sense for a rental; enforced here
      // regardless of what the client sends, not just hidden in the UI.
      billsStatus: data.listingType === "RENT" ? data.billsStatus ?? null : null,
      ownerName: data.ownerName ?? null,
      ownerPhone: data.ownerPhone ?? null,
      ownerWhatsapp: data.ownerWhatsapp ?? null,
      privateNotes: data.privateNotes ?? null,
      titleDeedNumber: data.listingType === "SALE" ? data.titleDeedNumber ?? null : null,
      titleDeedImage: data.listingType === "SALE" ? data.titleDeedImage ?? null : null,
      authorizationFormImage: data.listingType === "RENT" ? data.authorizationFormImage ?? null : null,
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
