import { NextRequest, NextResponse } from "next/server";
import { requireSession, parseJsonBody } from "@/lib/api-helpers";
import { listingUpdateSchema } from "@/lib/validation";
import { buildDupKey } from "@/lib/dupKey";
import { isResidentialCategory, bedroomOptionsFor, normalizeBuildingName, normalizeUnitValue } from "@/lib/propertyCategory";
import { canViewListing, visibleListingsWhere, canViewPrivateDetails, redactPrivateFields, redactPrivateFieldsList, PRIVATE_LISTING_FIELDS } from "@/lib/listingPrivacy";
import { unpublishListingFromPropertyFinder } from "@/lib/propertyFinder/sync";
import { fetchPfLocationSnapshot } from "@/lib/propertyFinder/location";
import { Prisma, PropertyCategory } from "@prisma/client";
import { isAdminRole } from "@/lib/roles";
import { withImageLinks } from "@/lib/listingImages";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const listing = await db!.listing.findUnique({
    where: { id: Number(id) },
    include: {
      createdBy: { select: { id: true, name: true, whatsapp: true, avatarUrl: true, pfPublicProfileId: true } },
      auditLogs: { include: { user: { select: { name: true } } }, orderBy: { timestamp: "desc" } },
      images: { orderBy: { sortOrder: "asc" }, select: { id: true, createdAt: true } },
      portalListings: true,
    },
  });
  // Someone else's private listing answers exactly like a missing one.
  if (!listing || !canViewListing(listing, session!.user.id, isAdminRole(session!.user.role))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // PortalListing is generic (one row per listing per portal) - reshape it
  // into the shapes each part of the frontend expects: the singular
  // `propertyFinderState` field existing PF UI already reads, plus a
  // `channelStates` map (by portal) for the newer Website/Qatar
  // Living/Property Oryx channel toggles.
  const { portalListings, ...listingRest } = listing;
  const shapedListing = {
    ...listingRest,
    images: withImageLinks(listing.id, listing.images),
    propertyFinderState: portalListings.find((p) => p.portal === "PROPERTY_FINDER") ?? null,
    channelStates: {
      WEBSITE: portalListings.find((p) => p.portal === "WEBSITE") ?? null,
      QATAR_LIVING: portalListings.find((p) => p.portal === "QATAR_LIVING") ?? null,
      PROPERTY_ORYX: portalListings.find((p) => p.portal === "PROPERTY_ORYX") ?? null,
      OTHER_PORTALS: portalListings.find((p) => p.portal === "OTHER_PORTALS") ?? null,
    },
  };

  const duplicates = await db!.listing.findMany({
    where: {
      dupKey: listing.dupKey,
      status: "ACTIVE",
      id: { not: listing.id },
      ...visibleListingsWhere(session!.user.id, isAdminRole(session!.user.role)),
    },
    include: {
      createdBy: { select: { id: true, name: true, whatsapp: true, avatarUrl: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true, url: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const isAdmin = isAdminRole(session!.user.role);
  const viewerCanSeePrivate = canViewPrivateDetails(listing.createdById, session!.user.id, isAdmin);
  return NextResponse.json({
    listing: redactPrivateFields(shapedListing, session!.user.id, isAdmin),
    duplicates: redactPrivateFieldsList(duplicates, session!.user.id, isAdmin),
    // Lets the client tell "not filled in" apart from "hidden from you"
    // for its own private-details section, without leaking that via the
    // (redacted-to-null) field values themselves.
    canViewPrivateDetails: viewerCanSeePrivate,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const listing = await db!.listing.findUnique({ where: { id: Number(id) } });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = listing.createdById === session!.user.id;
  const isAdmin = isAdminRole(session!.user.role);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "You can only edit your own listings" }, { status: 403 });
  }

  const { value: body, error: bodyError } = await parseJsonBody(req);
  if (bodyError) return bodyError;
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
  // Only enforce the category/bedroom-count pairing when this edit actually
  // touches one of those two fields - an edit to an unrelated field (price,
  // photos, ...) should never get blocked by a rule that postdates the
  // listing's original data.
  const touchesCategoryOrBedrooms = data.propertyCategory !== undefined || data.bedrooms !== undefined;
  if (touchesCategoryOrBedrooms && resultResidential && resultBedrooms && !bedroomOptionsFor(resultCategory).includes(resultBedrooms)) {
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
  // Optional fields: a blank means "none", stored as the community name / "-".
  trackChange("buildingName", listing.buildingName, data.buildingName === undefined ? undefined : normalizeBuildingName(data.buildingName, data.community ?? listing.community), "BUILDING");
  trackChange("floor", listing.floor, data.floor === undefined ? undefined : normalizeUnitValue(data.floor), "FLOOR");
  trackChange("apartmentNumber", listing.apartmentNumber, data.apartmentNumber === undefined ? undefined : normalizeUnitValue(data.apartmentNumber), "APARTMENT");
  trackChange("furnished", listing.furnished, data.furnished, "FURNISHED");
  trackChange("bathrooms", listing.bathrooms, data.bathrooms, "BATHROOMS");
  trackChange("title", listing.title, data.title, "TITLE");
  trackChange("description", listing.description, data.description, "DESCRIPTION");
  trackChange("titleAr", listing.titleAr, data.titleAr, "TITLE_AR");
  trackChange("descriptionAr", listing.descriptionAr, data.descriptionAr, "DESCRIPTION_AR");
  trackChange("pfLocationId", listing.pfLocationId, data.pfLocationId, "PROPERTY_FINDER_LOCATION");
  // Keep the readable Property Finder location (name, tree, coordinates) in
  // step with the chosen id - it's what the feeds and AI copy show. Looked up
  // when the id changes, and also for a listing that has an id but no saved
  // location yet. A failed lookup just leaves it empty (feeds fall back to
  // area/community) and is retried on the next save or publish.
  if (data.pfLocationId !== undefined) {
    if (data.pfLocationId === null) {
      if (listing.pfLocation !== null) updateData.pfLocation = Prisma.DbNull;
    } else if (data.pfLocationId !== listing.pfLocationId || listing.pfLocation === null) {
      const snapshot = await fetchPfLocationSnapshot(orgId!, data.pfLocationId);
      if (snapshot) updateData.pfLocation = snapshot as unknown as Prisma.InputJsonValue;
      else if (data.pfLocationId !== listing.pfLocationId) updateData.pfLocation = Prisma.DbNull;
    }
  }
  if (data.amenities !== undefined && JSON.stringify(data.amenities) !== JSON.stringify(listing.amenities)) {
    updateData.amenities = data.amenities;
    auditEntries.push({ action: "AMENITIES_CHANGED", oldValue: listing.amenities.join(", ") || "-", newValue: data.amenities.join(", ") || "-" });
  }
  // Bills included/excluded only makes sense for a rental - a listing's type
  // never changes after creation, so this self-heals any SALE listing back
  // to null on its next edit even if an older client ever sent a value.
  trackChange("billsStatus", listing.billsStatus, listing.listingType === "RENT" ? data.billsStatus : null, "BILLS");
  trackChange("availabilityStatus", listing.availabilityStatus, data.availabilityStatus, "AVAILABILITY_STATUS");
  trackChange("visibility", listing.visibility, data.visibility, "VISIBILITY");
  trackChange("unitDetailsPrivate", listing.unitDetailsPrivate, data.unitDetailsPrivate, "UNIT_DETAILS_PRIVACY");

  if (listing.listingType === "RENT") {
    trackChange("rentPrice", listing.rentPrice, data.rentPrice, "RENT_PRICE");
  } else {
    trackChange("salePrice", listing.salePrice, data.salePrice, "SALE_PRICE");
    trackChange("rentalValue", listing.rentalValue, data.rentalValue, "RENTAL_VALUE");
    trackChange("projectStatus", listing.projectStatus, data.projectStatus, "PROJECT_STATUS");
    trackChange("paymentMethods", listing.paymentMethods, data.paymentMethods, "PAYMENT_METHODS");
    // A down payment and years only mean something with installments; paying cash clears them.
    const method = data.paymentMethods !== undefined ? data.paymentMethods : listing.paymentMethods;
    const installments = method === "INSTALLMENTS" || method === "CASH_AND_INSTALLMENTS";
    trackChange("downPayment", listing.downPayment, installments ? data.downPayment : method ? null : undefined, "DOWN_PAYMENT");
    trackChange("mortgageYears", listing.mortgageYears, installments ? data.mortgageYears : method ? null : undefined, "MORTGAGE_YEARS");
  }

  // Private fields get a single generic audit entry with no values recorded -
  // the audit log is visible to any authenticated viewer of this listing (not
  // just its owner/admin), so logging the actual owner phone/title deed etc.
  // there would defeat the point of keeping them private.
  let privateDetailsChanged = false;
  // An owner must belong to this agency.
  if (data.ownerId && !(await db!.owner.findFirst({ where: { id: data.ownerId }, select: { id: true } }))) return NextResponse.json({ error: "Unknown owner" }, { status: 404 });
  for (const field of PRIVATE_LISTING_FIELDS) {
    const newVal = data[field];
    if (newVal !== undefined && newVal !== listing[field]) {
      updateData[field] = newVal;
      privateDetailsChanged = true;
    }
  }
  if (privateDetailsChanged) {
    auditEntries.push({ action: "PRIVATE_DETAILS_UPDATED", oldValue: "-", newValue: "-" });
  }

  // Recompute dupKey if location fields changed
  const newArea = (data.area ?? listing.area) as string;
  const newCommunity = (data.community ?? listing.community) as string;
  const newBuilding = (data.buildingName === undefined ? listing.buildingName : normalizeBuildingName(data.buildingName, newCommunity)) as string;
  const newFloor = (data.floor === undefined ? listing.floor : normalizeUnitValue(data.floor)) as string;
  const newApt = (data.apartmentNumber === undefined ? listing.apartmentNumber : normalizeUnitValue(data.apartmentNumber)) as string;
  updateData.dupKey = buildDupKey(newArea, newCommunity, newBuilding, newFloor, newApt);

  if (data.images !== undefined) {
    const previousCount = await db!.listingImage.count({ where: { listingId: listing.id } });
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

  // Photos: keep the ones sent as {id}, add the ones sent as images, drop the rest, in the order given.
  let imageOps: Prisma.PrismaPromise<unknown>[] = [];
  if (data.images !== undefined) {
    const have = new Set((await db!.listingImage.findMany({ where: { listingId: listing.id }, select: { id: true } })).map((i) => i.id));
    const refs = data.images;
    const keptIds = refs.flatMap((r) => (typeof r === "string" ? [] : [r.id]));
    if (keptIds.some((kept) => !have.has(kept)) || new Set(keptIds).size !== keptIds.length) {
      return NextResponse.json({ error: "A photo is no longer on this listing. Reload the page and try again." }, { status: 409 });
    }
    const fresh = refs.flatMap((r, index) => (typeof r === "string" ? [{ listingId: listing.id, url: r, sortOrder: index }] : []));
    imageOps = [
      db!.listingImage.deleteMany({ where: { listingId: listing.id, id: { notIn: keptIds } } }),
      ...refs.flatMap((r, index) => (typeof r === "string" ? [] : [db!.listingImage.updateMany({ where: { id: r.id, listingId: listing.id }, data: { sortOrder: index } })])),
      ...(fresh.length ? [db!.listingImage.createMany({ data: fresh })] : []),
    ];
  }

  const [updated] = await db!.$transaction([
    db!.listing.update({
      where: { id: listing.id },
      data: updateData,
      include: { createdBy: { select: { id: true, name: true, whatsapp: true, avatarUrl: true } } },
    }),
    ...imageOps,
  ]);

  if (auditEntries.length > 0) {
    await db!.auditLog.createMany({
      data: auditEntries.map((e) => ({
        listingId: listing.id,
        userId: session!.user.id,
        action: e.action,
        oldValue: e.oldValue,
        newValue: e.newValue,
      })),
    });
  }

  // A rented or sold property must not stay advertised: switch off every feed channel and take it down from
  // Property Finder. (A failure on Property Finder is logged on the listing's portal state; it never blocks the edit.)
  if ((data.availabilityStatus === "RENTED" || data.availabilityStatus === "SOLD") && listing.availabilityStatus !== data.availabilityStatus) {
    await db!.portalListing.updateMany({ where: { listingId: listing.id, enabled: true, portal: { in: ["WEBSITE", "QATAR_LIVING", "PROPERTY_ORYX", "OTHER_PORTALS"] } }, data: { enabled: false } });
    const pf = await db!.portalListing.findFirst({ where: { listingId: listing.id, portal: "PROPERTY_FINDER", OR: [{ enabled: true }, { remoteListingId: { not: null } }] }, select: { id: true } });
    if (pf) await unpublishListingFromPropertyFinder(orgId!, listing.id).catch((e) => console.error("auto-unpublish failed:", e instanceof Error ? e.message : e));
  }

  const images = await db!.listingImage.findMany({
    where: { listingId: listing.id },
    orderBy: { sortOrder: "asc" },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({ listing: { ...updated, images: withImageLinks(listing.id, images) } });
}

// Permanently removes a listing (unlike the reversible ACTIVE/INACTIVE
// status toggle at .../status). Only the listing's own agent or an admin may
// do this.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, db, orgId, error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const listingId = Number(id);
  const listing = await db!.listing.findUnique({
    where: { id: listingId },
    include: { portalListings: { where: { remoteListingId: { not: null } } } },
  });
  if (!listing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = listing.createdById === session!.user.id;
  const isAdmin = isAdminRole(session!.user.role);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "You can only delete your own listings" }, { status: 403 });
  }

  // Best-effort: pull it off any portal it was ever created on first, so
  // deleting it locally doesn't leave an orphaned listing live on Property
  // Finder that this app can no longer manage. A failure here (already
  // unpublished, API hiccup, etc.) shouldn't block the actual deletion.
  for (const portalListing of listing.portalListings) {
    if (portalListing.portal === "PROPERTY_FINDER") {
      await unpublishListingFromPropertyFinder(orgId!, listingId).catch(() => {});
    }
  }

  await db!.listing.delete({ where: { id: listingId } });
  return NextResponse.json({ deleted: true });
}
