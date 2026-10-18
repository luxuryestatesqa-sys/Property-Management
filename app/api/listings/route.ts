import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { withImageLinks } from "@/lib/listingImages";
import { listingCreateSchema } from "@/lib/validation";
import { buildDupKey } from "@/lib/dupKey";
import { normalizeBuildingName, normalizeUnitValue } from "@/lib/propertyCategory";
import { redactPrivateFieldsList, unitDetailsSearchableWhere, visibleListingsWhere } from "@/lib/listingPrivacy";
import { parseBedroomKeywords, parseBareBedroomQuery } from "@/lib/searchKeywords";
import { Prisma, PropertyCategory, BedroomCount } from "@prisma/client";
import { isAdminRole } from "@/lib/roles";
import { avatarLink } from "@/lib/avatar";
import { collapseSpaces, escapeLike } from "@/lib/search";
import { fetchPfLocationSnapshot } from "@/lib/propertyFinder/location";

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
  const { session, db, error } = await requireSession();
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  // Callers (e.g. the infinite-scrolling properties list) can request a
  // smaller page size; other callers keep the existing default untouched.
  const requestedPageSize = Number(sp.get("pageSize"));
  const pageSize =
    Number.isFinite(requestedPageSize) && requestedPageSize > 0
      ? Math.min(Math.floor(requestedPageSize), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  const q = collapseSpaces(sp.get("q") ?? "");
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
  const page = Math.max(1, Math.floor(Number(sp.get("page"))) || 1);
  const mine = sp.get("mine"); // "1" -> only current user's listings

  const isAdmin = isAdminRole(session!.user.role);
  // Other agents' private listings never appear, whatever else is filtered.
  const conditions: Prisma.ListingWhereInput[] = [visibleListingsWhere(session!.user.id, isAdmin)];

  // Non-admins never see other agents' inactive listings via the main search unless it's their own (mine=1)
  if (mine === "1") {
    conditions.push({ createdById: session!.user.id });
    if (status === "ACTIVE" || status === "INACTIVE") {
      conditions.push({ status });
    }
  } else if (isAdminRole(session!.user.role)) {
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

  if (rentMin) conditions.push({ rentPrice: { gte: Number(rentMin) || 0 } });
  if (rentMax) conditions.push({ rentPrice: { lte: Number(rentMax) || 0 } });
  if (saleMin) conditions.push({ salePrice: { gte: Number(saleMin) || 0 } });
  if (saleMax) conditions.push({ salePrice: { lte: Number(saleMax) || 0 } });

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
      const unitSearchable = unitDetailsSearchableWhere(session!.user.id, isAdmin);
      const like = escapeLike(q);
      const orConds: Prisma.ListingWhereInput[] = [
        { area: { contains: like, mode: "insensitive" } },
        { community: { contains: like, mode: "insensitive" } },
        { buildingName: { contains: like, mode: "insensitive" } },
        // Hidden unit details must not be searchable by other agents.
        { AND: [{ apartmentNumber: { contains: like, mode: "insensitive" } }, unitSearchable] },
        { AND: [{ floor: { contains: like, mode: "insensitive" } }, unitSearchable] },
        { createdBy: { name: { contains: like, mode: "insensitive" } } },
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

  // The All / Rent / Sale tab counts only need the number, not a page of listings. Cached briefly.
  if (sp.get("countOnly") === "1") {
    const total = await db!.listing.count({ where: finalWhere });
    return NextResponse.json({ total }, { headers: { "Cache-Control": "private, max-age=20" } });
  }

  const [total, listings] = await Promise.all([
    db!.listing.count({ where: finalWhere }),
    db!.listing.findMany({
      where: finalWhere,
      // The list never needs the scanned documents (large data URLs) or the long private notes.
      omit: { titleDeedImage: true, authorizationFormImage: true },
      include: {
        createdBy: { select: { id: true, name: true, whatsapp: true, avatarUrl: true } },
        // Only the cover's id: the photo itself is a link to the cacheable image route, never embedded.
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    listings: redactPrivateFieldsList(listings.map((l) => ({ ...l, createdBy: avatarLink(l.createdBy)!, images: withImageLinks(l.id, l.images) })), session!.user.id, isAdmin),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

export async function POST(req: NextRequest) {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;

  const { value: body, error: bodyError } = await parseJsonBody(req);
  if (bodyError) return bodyError;
  const parsed = listingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // Building name, floor and unit number are optional: blanks become the community name and "-".
  const buildingName = normalizeBuildingName(data.buildingName, data.community);
  const floor = normalizeUnitValue(data.floor);
  const apartmentNumber = normalizeUnitValue(data.apartmentNumber);
  const dupKey = buildDupKey(data.area, data.community, buildingName, floor, apartmentNumber);

  if (!data.confirmDuplicate) {
    const existing = await db!.listing.findMany({
      where: {
        dupKey,
        status: "ACTIVE",
        ...visibleListingsWhere(session!.user.id, isAdminRole(session!.user.role)),
      },
      include: {
        createdBy: { select: { id: true, name: true, whatsapp: true, avatarUrl: true } },
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true, url: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    if (existing.length > 0) {
      const isAdmin = isAdminRole(session!.user.role);
      return NextResponse.json(
        { duplicate: true, existing: redactPrivateFieldsList(existing, session!.user.id, isAdmin) },
        { status: 200 }
      );
    }
  }

  // Keep Property Finder's readable name/tree/coordinates for the chosen location, so feeds show
  // exactly what PF shows. A failed lookup just leaves it empty (retried on the next save/publish).
  const pfSnapshot = data.pfLocationId ? await fetchPfLocationSnapshot(orgId!, data.pfLocationId) : null;

  const listing = await db!.listing.create({
    data: {
      organizationId: orgId!,
      pfLocationId: data.pfLocationId ?? null,
      ...(pfSnapshot ? { pfLocation: pfSnapshot as unknown as Prisma.InputJsonValue } : {}),
      listingType: data.listingType,
      propertyCategory: data.propertyCategory,
      bedrooms: data.bedrooms ?? null,
      sizeSqm: data.sizeSqm ?? null,
      area: data.area,
      community: data.community,
      buildingName,
      floor,
      apartmentNumber,
      dupKey,
      visibility: data.visibility ?? "SHARED",
      unitDetailsPrivate: data.unitDetailsPrivate ?? false,
      rentPrice: data.listingType === "RENT" ? data.rentPrice : null,
      salePrice: data.listingType === "SALE" ? data.salePrice : null,
      rentalValue: data.listingType === "SALE" ? data.rentalValue ?? null : null,
      // Property Finder's mandatory sale details; a rental never has them. A down payment and the
      // number of years only apply when the buyer can pay in installments.
      projectStatus: data.listingType === "SALE" ? data.projectStatus ?? null : null,
      paymentMethods: data.listingType === "SALE" ? data.paymentMethods ?? null : null,
      downPayment: data.listingType === "SALE" && data.paymentMethods && data.paymentMethods !== "CASH" ? data.downPayment ?? null : null,
      mortgageYears: data.listingType === "SALE" && data.paymentMethods && data.paymentMethods !== "CASH" ? data.mortgageYears ?? null : null,
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
      ownerId: data.ownerId && (await db!.owner.findFirst({ where: { id: data.ownerId }, select: { id: true } })) ? data.ownerId : null,
      leaseEndDate: data.listingType === "RENT" ? data.leaseEndDate ?? null : null,
      title: data.title ?? null,
      description: data.description ?? null,
      titleAr: data.titleAr ?? null,
      descriptionAr: data.descriptionAr ?? null,
      amenities: data.amenities ?? [],
      bathrooms: data.bathrooms ?? null,
      createdById: session!.user.id,
    },
  });

  if (data.images && data.images.length > 0) {
    await db!.listingImage.createMany({
      data: data.images.map((url, index) => ({ listingId: listing.id, url, sortOrder: index })),
    });
  }

  await db!.auditLog.create({
    data: {
      listingId: listing.id,
      userId: session!.user.id,
      action: "CREATED",
      newValue: "Listing created",
    },
  });

  const created = await db!.listing.findUnique({
    where: { id: listing.id },
    include: {
      createdBy: { select: { id: true, name: true, whatsapp: true, avatarUrl: true } },
      images: { orderBy: { sortOrder: "asc" }, select: { id: true, createdAt: true } },
    },
  });

  return NextResponse.json({ duplicate: false, listing: created && { ...created, images: withImageLinks(created.id, created.images) } }, { status: 201 });
}
