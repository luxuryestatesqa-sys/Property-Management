import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-helpers";
import { listingUpdateSchema } from "@/lib/validation";
import { buildDupKey } from "@/lib/dupKey";
import { isResidentialCategory, bedroomOptionsFor } from "@/lib/propertyCategory";
import { PropertyCategory } from "@prisma/client";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const listing = await prisma.listing.findUnique({
    where: { id: Number(id) },
    include: {
      createdBy: { select: { id: true, name: true, whatsapp: true, avatarUrl: true } },
      auditLogs: { include: { user: { select: { name: true } } }, orderBy: { timestamp: "desc" } },
      images: { orderBy: { sortOrder: "asc" }, select: { id: true, url: true } },
    },
  });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const duplicates = await prisma.listing.findMany({
    where: { dupKey: listing.dupKey, status: "ACTIVE", id: { not: listing.id } },
    include: {
      createdBy: { select: { id: true, name: true, whatsapp: true, avatarUrl: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true, url: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ listing, duplicates });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const listing = await prisma.listing.findUnique({ where: { id: Number(id) } });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = listing.createdById === session!.user.id;
  const isAdmin = session!.user.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "You can only edit your own listings" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = listingUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  if (data.availabilityStatus) {
    const validForType =
      listing.listingType === "RENT"
        ? ["AVAILABLE", "RESERVED", "RENTED"]
        : ["AVAILABLE", "RESERVED", "SOLD"];
    if (!validForType.includes(data.availabilityStatus)) {
      return NextResponse.json(
        { error: `"${data.availabilityStatus}" is not valid for a ${listing.listingType === "RENT" ? "rental" : "sale"} listing` },
        { status: 400 }
      );
    }
  }

  const resultCategory = (data.propertyCategory ?? listing.propertyCategory) as PropertyCategory;
  const resultResidential = isResidentialCategory(resultCategory);
  const resultBedrooms = data.bedrooms !== undefined ? data.bedrooms : listing.bedrooms;
  if (resultResidential && !resultBedrooms) {
    return NextResponse.json({ error: "Bedrooms is required for this property type" }, { status: 400 });
  }
  if (resultResidential && resultBedrooms && !bedroomOptionsFor(resultCategory).includes(resultBedrooms)) {
    return NextResponse.json({ error: `"${resultBedrooms}" is not a valid bedroom count for this property type` }, { status: 400 });
  }
  if (!resultResidential) {
    // Non-residential categories (Office / Retail / Land) never carry a bedroom count.
    data.bedrooms = null;
  }

  const updateData: Record<string, unknown> = {};
  const auditEntries: { action: string; oldValue: string; newValue: string }[] = [];

  const trackChange = (field: string, oldVal: unknown, newVal: unknown, label: string) => {
    if (newVal !== undefined && newVal !== oldVal) {
      updateData[field] = newVal;
      auditEntries.push({
        action: `${label}_CHANGED`,
        oldValue: String(oldVal ?? "-"),
        newValue: String(newVal ?? "-"),
      });
    }
  };

  trackChange("propertyCategory", listing.propertyCategory, data.propertyCategory, "PROPERTY_CATEGORY");
  trackChange("bedrooms", listing.bedrooms, data.bedrooms, "BEDROOMS");
  trackChange("sizeSqm", listing.sizeSqm, data.sizeSqm, "SIZE");
  trackChange("area", listing.area, data.area, "AREA");
  trackChange("community", listing.community, data.community, "COMMUNITY");
  trackChange("buildingName", listing.buildingName, data.buildingName, "BUILDING");
  trackChange("floor", listing.floor, data.floor, "FLOOR");
  trackChange("apartmentNumber", listing.apartmentNumber, data.apartmentNumber, "APARTMENT");
  trackChange("furnished", listing.furnished, data.furnished, "FURNISHED");
  trackChange("billsStatus", listing.billsStatus, data.billsStatus, "BILLS");
  trackChange("availabilityStatus", listing.availabilityStatus, data.availabilityStatus, "AVAILABILITY_STATUS");

  if (listing.listingType === "RENT") {
    trackChange("rentPrice", listing.rentPrice, data.rentPrice, "RENT_PRICE");
  } else {
    trackChange("salePrice", listing.salePrice, data.salePrice, "SALE_PRICE");
    trackChange("rentalValue", listing.rentalValue, data.rentalValue, "RENTAL_VALUE");
  }

  // Recompute dupKey if location fields changed
  const newArea = (data.area ?? listing.area) as string;
  const newCommunity = (data.community ?? listing.community) as string;
  const newBuilding = (data.buildingName ?? listing.buildingName) as string;
  const newFloor = (data.floor ?? listing.floor) as string;
  const newApt = (data.apartmentNumber ?? listing.apartmentNumber) as string;
  updateData.dupKey = buildDupKey(newArea, newCommunity, newBuilding, newFloor, newApt);

  if (data.images !== undefined) {
    const previousCount = await prisma.listingImage.count({ where: { listingId: listing.id } });
    if (previousCount !== data.images.length) {
      auditEntries.push({
        action: "PHOTOS_CHANGED",
        oldValue: `${previousCount} photo${previousCount === 1 ? "" : "s"}`,
        newValue: `${data.images.length} photo${data.images.length === 1 ? "" : "s"}`,
      });
    }
  }

  if (Object.keys(updateData).length === 0 && data.images === undefined) {
    return NextResponse.json({ listing });
  }

  const [updated] = await prisma.$transaction([
    prisma.listing.update({
      where: { id: listing.id },
      data: updateData,
      include: { createdBy: { select: { id: true, name: true, whatsapp: true, avatarUrl: true } } },
    }),
    ...(data.images !== undefined
      ? [
          prisma.listingImage.deleteMany({ where: { listingId: listing.id } }),
          prisma.listingImage.createMany({
            data: data.images.map((url, index) => ({ listingId: listing.id, url, sortOrder: index })),
          }),
        ]
      : []),
  ]);

  if (auditEntries.length > 0) {
    await prisma.auditLog.createMany({
      data: auditEntries.map((e) => ({
        listingId: listing.id,
        userId: session!.user.id,
        action: e.action,
        oldValue: e.oldValue,
        newValue: e.newValue,
      })),
    });
  }

  const images = await prisma.listingImage.findMany({
    where: { listingId: listing.id },
    orderBy: { sortOrder: "asc" },
    select: { id: true, url: true },
  });

  return NextResponse.json({ listing: { ...updated, images } });
}
