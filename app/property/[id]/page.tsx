"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ListingDTO, AuditLogDTO, AvailabilityStatus, ListingVisibility, PropertyCategory, BedroomCount } from "@/lib/types";
import { formatQAR, formatSqm, formatDate, formatDateTime, listingCode } from "@/lib/format";
import { describeAuditEntry } from "@/lib/audit";
import { extractErrorMessage } from "@/lib/errors";
import { AVAILABILITY_LABELS, AVAILABILITY_COLORS, availabilityOptionsFor } from "@/lib/availability";
import {
  PROPERTY_CATEGORY_LABELS,
  PROPERTY_CATEGORY_OPTIONS,
  BEDROOM_LABELS,
  BEDROOM_SHORT_LABELS,
  isResidentialCategory,
  bedroomOptionsFor,
  unitLabelFor,
  unitSummary,
  NO_FLOOR_VALUE,
  buildingNameForForm,
  unitValueForForm,
} from "@/lib/propertyCategory";
import SegmentedControl from "@/components/SegmentedControl";
import VisibilityField from "@/components/VisibilityField";
import UnitDetailsPrivacyField from "@/components/UnitDetailsPrivacyField";
import CollapsibleChipSelect from "@/components/CollapsibleChipSelect";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import LocationCombinedInput from "@/components/LocationCombinedInput";
import WhatsAppButton from "@/components/WhatsAppButton";
import { useConfirm } from "@/components/ConfirmDialog";
import { buildListingInquiryMessage, buildListingShareMessage } from "@/lib/whatsapp";
import { buildListingShareUrl } from "@/lib/shareLink";
import CallButton from "@/components/CallButton";
import Avatar from "@/components/Avatar";
import PhotoPicker from "@/components/PhotoPicker";
import PhotoGallery from "@/components/PhotoGallery";
import PhotoGalleryDesktop from "@/components/desktop/PhotoGalleryDesktop";
import { TypePill, AvailabilityPill, PrivatePill } from "@/components/desktop/Badges";
import { IconPin, IconBed, IconBath, IconRuler, IconBuilding, IconEdit, IconChevronLeft, IconCheck, IconLink, IconLock } from "@/components/desktop/icons";
import RowMenu from "@/components/desktop/RowMenu";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { useOrg } from "@/components/OrgProvider";
import { AMENITY_LABELS } from "@/lib/propertyFinder/mapping";
import PrivateDetailsSection, { EMPTY_PRIVATE_DETAILS, PrivateDetailsValue } from "@/components/PrivateDetailsSection";
import PropertyDetailSkeleton from "@/components/PropertyDetailSkeleton";
import PublishToPortalsCard from "@/components/PublishToPortalsCard";
import { usePfStatusPolling } from "@/lib/usePfStatusPolling";
import { bathroomsToInputValue, bathroomsFromInputValue } from "@/lib/propertyFinder/mapping";
import { isAdminRole } from "@/lib/roles";
import { splitPhotoBatches } from "@/lib/photoBatches";
import SaleDetailsFields, { SaleDetailsSummary, saleDetailsPayload, saleDetailsProblem, type SaleDetailsValue } from "@/components/SaleDetailsFields";

const PROPERTY_TYPE_EDIT_OPTIONS = PROPERTY_CATEGORY_OPTIONS.map((c) => ({ label: PROPERTY_CATEGORY_LABELS[c], value: c }));

export default function PropertyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const confirm = useConfirm();
  const isDesktop = useIsDesktop();
  const org = useOrg();
  const id = params.id as string;
  const openInEditMode = searchParams.get("edit") === "1";

  const [listing, setListing] = useState<ListingDTO | null>(null);
  const [duplicates, setDuplicates] = useState<ListingDTO[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const [form, setForm] = useState<Record<string, string>>({});
  const [images, setImages] = useState<string[]>([]);
  const [initialImages, setInitialImages] = useState<string[]>([]);
  // The photos the listing already has (by address), so an edit only uploads the new ones.
  const [imageIds, setImageIds] = useState<Record<string, string>>({});
  const [unitDetailsPrivate, setUnitDetailsPrivate] = useState(false);
  const [canViewPrivateDetails, setCanViewPrivateDetails] = useState(false);
  const [privateDetails, setPrivateDetails] = useState<PrivateDetailsValue>(EMPTY_PRIVATE_DETAILS);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/listings/${id}`);
    if (res.ok) {
      const data = await res.json();
      setListing(data.listing);
      setDuplicates(data.duplicates ?? []);
      setAuditLogs(data.listing.auditLogs ?? []);
      setForm({
        propertyCategory: data.listing.propertyCategory,
        bedrooms: data.listing.bedrooms ?? "",
        bathrooms: bathroomsToInputValue(data.listing.bathrooms),
        sizeSqm: data.listing.sizeSqm ? String(data.listing.sizeSqm) : "",
        title: data.listing.title ?? "",
        description: data.listing.description ?? "",
        area: data.listing.area,
        community: data.listing.community,
        buildingName: buildingNameForForm(data.listing.buildingName, data.listing.community),
        floor: unitValueForForm(data.listing.floor),
        apartmentNumber: unitValueForForm(data.listing.apartmentNumber),
        rentPrice: data.listing.rentPrice ? String(data.listing.rentPrice) : "",
        salePrice: data.listing.salePrice ? String(data.listing.salePrice) : "",
        rentalValue: data.listing.rentalValue ? String(data.listing.rentalValue) : "",
        projectStatus: data.listing.projectStatus ?? "",
        paymentMethods: data.listing.paymentMethods ?? "",
        downPayment: data.listing.downPayment !== null && data.listing.downPayment !== undefined ? String(data.listing.downPayment) : "0",
        mortgageYears: data.listing.mortgageYears ? String(data.listing.mortgageYears) : "",
        furnished: data.listing.furnished,
        billsStatus: data.listing.billsStatus ?? "INCLUDED",
        availabilityStatus: data.listing.availabilityStatus,
        visibility: data.listing.visibility,
      });
      const urls = data.listing.images.map((img: { url: string }) => img.url);
      setImages(urls);
      setInitialImages(urls);
      setImageIds(Object.fromEntries(data.listing.images.map((img: { id: string; url: string }) => [img.url, img.id])));
      setCanViewPrivateDetails(Boolean(data.canViewPrivateDetails));
      setUnitDetailsPrivate(Boolean(data.listing.unitDetailsPrivate));
      setPrivateDetails({
        ownerName: data.listing.ownerName ?? "",
        ownerPhone: data.listing.ownerPhone ?? "",
        ownerWhatsapp: data.listing.ownerWhatsapp ?? "",
        titleDeedNumber: data.listing.titleDeedNumber ?? "",
        privateNotes: data.listing.privateNotes ?? "",
        titleDeedImage: data.listing.titleDeedImage ?? null,
        authorizationFormImage: data.listing.authorizationFormImage ?? null,
      });
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!openInEditMode || !listing || !session?.user) return;
    const canManage = session.user.id === listing.createdById || isAdminRole(session.user.role);
    if (canManage) setEditing(true);
    router.replace(`/property/${id}`, { scroll: false });
    // Only meant to fire once, right after the initial load navigated here with ?edit=1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInEditMode, listing, session]);

  // Only the owner/admin can refresh Property Finder's status, so only they poll.
  const mayPollPf = Boolean(listing && (session?.user?.id === listing.createdById || isAdminRole(session?.user?.role)));
  usePfStatusPolling(
    mayPollPf ? listing?.id : undefined,
    listing?.propertyFinderState,
    useCallback((state) => setListing((prev) => (prev ? { ...prev, propertyFinderState: state } : prev)), [])
  );

  if (loading) {
    return <PropertyDetailSkeleton />;
  }

  if (!listing) {
    return (
      <div className="px-4 py-16 text-center text-muted">
        <p>Property not found.</p>
        <Link href="/" className="font-semibold" style={{ color: "var(--primary)" }}>
          Back to Properties
        </Link>
      </div>
    );
  }

  const isOwner = session?.user?.id === listing.createdById;
  const isAdmin = isAdminRole(session?.user?.role);
  const canManage = isOwner || isAdmin;
  const isRent = listing.listingType === "RENT";

  // New photos go up in small batches (one request can't carry them all); photos the listing already has
  // are only referred to by id. Returns the final order for the save.
  async function uploadNewPhotos(): Promise<{ id: string }[]> {
    const fresh = images.filter((u) => !imageIds[u]);
    const dropped = initialImages.filter((u) => imageIds[u] && !images.includes(u)).map((u) => imageIds[u]);
    const uploaded: Record<string, string> = {};
    for (const batch of splitPhotoBatches(fresh)) {
      const res = await fetch(`/api/listings/${id}/images`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images: batch, ignoreIds: dropped }) });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(extractErrorMessage(d?.error, "Couldn't upload the photos."));
      batch.forEach((u, i) => {
        uploaded[u] = d.images[i].id;
      });
    }
    return images.map((u) => ({ id: imageIds[u] ?? uploaded[u] }));
  }

  async function saveEdit() {
    setError("");
    if (isResidentialCategory(form.propertyCategory as PropertyCategory) && !form.bedrooms) {
      setError("Bedrooms is required for this property type.");
      return;
    }
    if (!form.sizeSqm) {
      setError("Size is required.");
      return;
    }
    if (images.length === 0) {
      setError("At least one photo is required.");
      return;
    }
    setSaving(true);
    try {
      const category = form.propertyCategory as PropertyCategory;
      const body: Record<string, unknown> = {
        propertyCategory: category,
        bedrooms: isResidentialCategory(category) ? form.bedrooms || null : null,
        bathrooms: category !== "LAND" ? bathroomsFromInputValue(form.bathrooms) : null,
        sizeSqm: Number(form.sizeSqm),
        title: form.title.trim() || null,
        description: form.description.trim() || null,
        area: form.area,
        community: form.community,
        buildingName: form.buildingName,
        floor: unitLabelFor(category).showFloor ? form.floor : NO_FLOOR_VALUE,
        apartmentNumber: form.apartmentNumber,
        furnished: form.furnished,
        billsStatus: isRent ? form.billsStatus : null,
        availabilityStatus: form.availabilityStatus,
        visibility: form.visibility,
        unitDetailsPrivate,
        ownerName: privateDetails.ownerName.trim() || null,
        ownerPhone: privateDetails.ownerPhone.trim() || null,
        ownerWhatsapp: privateDetails.ownerWhatsapp.trim() || null,
        titleDeedNumber: privateDetails.titleDeedNumber.trim() || null,
        privateNotes: privateDetails.privateNotes.trim() || null,
        titleDeedImage: privateDetails.titleDeedImage,
        authorizationFormImage: privateDetails.authorizationFormImage,
      };
      const imagesChanged = images.length !== initialImages.length || images.some((url, i) => url !== initialImages[i]);
      if (imagesChanged) {
        try {
          body.images = await uploadNewPhotos();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't upload the photos.");
          return;
        }
      }
      if (isRent) {
        body.rentPrice = Number(form.rentPrice);
      } else {
        body.salePrice = Number(form.salePrice);
        body.rentalValue = form.rentalValue ? Number(form.rentalValue) : null;
        // Property Finder's mandatory sale details. An older sale that never had them may be saved
        // without; once any are chosen, they must be complete.
        if (form.projectStatus || form.paymentMethods) {
          const problem = saleDetailsProblem(form as unknown as SaleDetailsValue);
          if (problem) {
            setError(problem);
            return;
          }
        }
        Object.assign(body, saleDetailsPayload(form as unknown as SaleDetailsValue));
      }
      const res = await fetch(`/api/listings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(extractErrorMessage(data?.error, "Failed to save changes."));
        return;
      }
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function copyListingId() {
    if (!listing) return;
    try {
      await navigator.clipboard.writeText(listingCode(listing.id));
      setIdCopied(true);
      setTimeout(() => setIdCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (permissions, non-HTTPS) - not worth surfacing an error for a copy button.
    }
  }

  async function copyListingLink() {
    if (!listing || !session?.user?.id) return;
    try {
      await navigator.clipboard.writeText(buildListingShareUrl(listing, session.user.id));
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (permissions, non-HTTPS) - not worth surfacing an error for a copy button.
    }
  }

  async function changeAvailability(next: AvailabilityStatus) {
    if (!listing || next === listing.availabilityStatus) return;
    setAvailabilityBusy(true);
    try {
      const res = await fetch(`/api/listings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availabilityStatus: next }),
      });
      if (res.ok) await load();
    } finally {
      setAvailabilityBusy(false);
    }
  }

  async function toggleStatus() {
    if (!listing) return;
    const nextStatus = listing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const confirmed =
      nextStatus === "INACTIVE"
        ? await confirm({
            title: "Deactivate Listing?",
            message: "It will be hidden from active search. You can reactivate it anytime from My Listings.",
            confirmLabel: "Deactivate",
            danger: true,
          })
        : await confirm({
            title: "Reactivate Listing?",
            message: "It will become visible in active search results again.",
            confirmLabel: "Reactivate",
          });
    if (!confirmed) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/listings/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) await load();
    } finally {
      setSaving(false);
    }
  }

  const view_gallery = (
    <>
          <PhotoGallery images={listing.images} />

    </>
  );

  const view_summary = (
    <>
          <div className="rounded-2xl border border-border bg-surface shadow-sm p-4">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{
                  background: isRent ? "var(--rent-bg)" : "var(--sale-bg)",
                  color: isRent ? "var(--rent-text)" : "var(--sale-text)",
                }}
              >
                {isRent ? "FOR RENT" : "FOR SALE"}
              </span>
              <span
                className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: AVAILABILITY_COLORS[listing.availabilityStatus].bg, color: AVAILABILITY_COLORS[listing.availabilityStatus].text }}
              >
                {AVAILABILITY_LABELS[listing.availabilityStatus]}
              </span>
              {listing.visibility === "PRIVATE" && (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-surface-muted text-muted">🔒 PRIVATE</span>
              )}
              {listing.unitDetailsPrivate && (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-surface-muted text-muted">🔒 UNIT HIDDEN</span>
              )}
            </div>

            <div className="text-[26px] font-extrabold text-foreground mt-2.5 leading-tight">
              {isRent ? `${formatQAR(listing.rentPrice)}/month` : formatQAR(listing.salePrice)}
            </div>
            {!isRent && listing.rentalValue && (
              <div className="text-[13px] text-muted mt-0.5">Rental Value: {formatQAR(listing.rentalValue)}/month</div>
            )}
            <SaleDetailsSummary listing={listing} className="mt-3" />

            <div className="flex items-start gap-1.5 mt-3 text-[13px] text-muted">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              <span>
                {listing.area} → {listing.community}
              </span>
            </div>
            <div className="text-[15px] font-semibold text-foreground mt-1">
              {listing.buildingName}
              {unitSummary(listing, false) && ` · ${unitSummary(listing, false)}`}
            </div>

            <div className="h-px bg-border my-3" />

            <div className="text-[13px] text-muted">
              {[
                PROPERTY_CATEGORY_LABELS[listing.propertyCategory],
                listing.bedrooms ? BEDROOM_SHORT_LABELS[listing.bedrooms] : null,
                listing.sizeSqm ? formatSqm(listing.sizeSqm) : null,
              ]
                .filter(Boolean)
                .join("  •  ")}
            </div>
            {listing.propertyCategory !== "LAND" && (
              <div className="text-[13px] text-muted mt-1">
                {[
                  listing.furnished === "FURNISHED" ? "Furnished" : "Unfurnished",
                  isRent && listing.billsStatus ? `Bills ${listing.billsStatus === "INCLUDED" ? "Included" : "Excluded"}` : null,
                ]
                  .filter(Boolean)
                  .join("  •  ")}
              </div>
            )}
          </div>

    </>
  );

  const view_contact = (
    <>
          {!isOwner && (
            <div className="flex gap-2.5">
              <WhatsAppButton
                number={listing.createdBy.whatsapp}
                message={buildListingInquiryMessage(listing, org.name)}
                label="WhatsApp Now"
                variant="full"
                className="flex-1 justify-center py-3 text-[14px]"
              />
              <CallButton
                number={listing.createdBy.whatsapp}
                label="Call Now"
                variant="full"
                className="flex-1 justify-center py-3 text-[14px]"
              />
            </div>
          )}
    </>
  );

  const view_avail = (
    <>
          {canManage && (
            <section className="rounded-2xl border border-border bg-surface shadow-sm p-4">
              <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Availability</h3>
              <span className="relative block">
                <select
                  value={listing.availabilityStatus}
                  disabled={availabilityBusy}
                  onChange={(e) => e.target.value !== listing.availabilityStatus && changeAvailability(e.target.value as AvailabilityStatus)}
                  aria-label="Availability"
                  className="h-12 w-full cursor-pointer appearance-none rounded-xl pl-4 pr-11 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                  style={{ background: AVAILABILITY_COLORS[listing.availabilityStatus].bg, color: AVAILABILITY_COLORS[listing.availabilityStatus].text }}
                >
                  {availabilityOptionsFor(listing.listingType).map((opt) => (
                    <option key={opt} value={opt}>
                      {AVAILABILITY_LABELS[opt]}
                    </option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={AVAILABILITY_COLORS[listing.availabilityStatus].text} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </section>
          )}
    </>
  );

  const view_portals = (
    <>
          <PublishToPortalsCard listing={listing} readOnly={!canManage} />

    </>
  );

  const view_info = (
    <>
          <section className="rounded-2xl border border-border bg-surface shadow-sm p-4">
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Listing Information</h3>
            <dl className="flex flex-col gap-2.5 text-[14px]">
              <div className="flex justify-between items-center">
                <dt className="text-muted">Listing ID</dt>
                <dd className="font-medium flex items-center gap-2">
                  {listingCode(listing.id)}
                  <button
                    type="button"
                    onClick={copyListingId}
                    aria-label="Copy listing ID"
                    className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-surface-muted text-muted active:opacity-70"
                  >
                    {idCopied ? "Copied" : "Copy"}
                  </button>
                </dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-muted">Added By</dt>
                <dd className="font-medium flex items-center gap-2">
                  <Avatar name={listing.createdBy.name} avatarUrl={listing.createdBy.avatarUrl} size={24} />
                  {listing.createdBy.name}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Added On</dt>
                <dd className="font-medium">{formatDateTime(listing.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Last Updated</dt>
                <dd className="font-medium">{formatDateTime(listing.updatedAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <dd className={`font-semibold ${listing.status === "ACTIVE" ? "" : "text-danger"}`} style={listing.status === "ACTIVE" ? { color: "var(--success)" } : undefined}>
                  {listing.status === "ACTIVE" ? "Active" : "Inactive"}
                </dd>
              </div>
            </dl>
          </section>

    </>
  );

  const view_priv = (
    <>
          {canViewPrivateDetails &&
            (listing.ownerName ||
              listing.ownerPhone ||
              listing.ownerWhatsapp ||
              listing.titleDeedNumber ||
              listing.privateNotes ||
              listing.titleDeedImage ||
              listing.authorizationFormImage) && (
              <section className="rounded-2xl border border-dashed border-border bg-surface-muted/40 p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide">Private Details</h3>
                  <span className="text-[11px] text-muted ml-auto">Only visible to you</span>
                </div>
                <dl className="flex flex-col gap-2.5 text-[14px]">
                  {listing.ownerName && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted shrink-0">Owner Name</dt>
                      <dd className="font-medium text-right">{listing.ownerName}</dd>
                    </div>
                  )}
                  {listing.ownerPhone && (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted shrink-0">Owner Phone</dt>
                      <dd className="font-medium text-right flex items-center gap-2">
                        {listing.ownerPhone}
                        <CallButton number={listing.ownerPhone} size={26} />
                      </dd>
                    </div>
                  )}
                  {listing.ownerWhatsapp && (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted shrink-0">Owner WhatsApp</dt>
                      <dd className="font-medium text-right flex items-center gap-2">
                        {listing.ownerWhatsapp}
                        <WhatsAppButton number={listing.ownerWhatsapp} name={listing.ownerName ?? undefined} size={26} />
                      </dd>
                    </div>
                  )}
                  {listing.titleDeedNumber && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted shrink-0">Title Deed Number</dt>
                      <dd className="font-medium text-right">{listing.titleDeedNumber}</dd>
                    </div>
                  )}
                  {listing.privateNotes && (
                    <div className="flex flex-col gap-1">
                      <dt className="text-muted">Notes</dt>
                      <dd className="font-medium whitespace-pre-wrap">{listing.privateNotes}</dd>
                    </div>
                  )}
                  {listing.titleDeedImage && (
                    <div className="flex flex-col gap-1.5">
                      <dt className="text-muted">Title Deed Photo</dt>
                      <dd>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={listing.titleDeedImage}
                          alt="Title deed"
                          loading="lazy"
                          decoding="async"
                          className="w-full max-w-[220px] aspect-[4/3] object-cover rounded-xl border border-border"
                        />
                      </dd>
                    </div>
                  )}
                  {listing.authorizationFormImage && (
                    <div className="flex flex-col gap-1.5">
                      <dt className="text-muted">Authorization Form</dt>
                      <dd>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={listing.authorizationFormImage}
                          alt="Authorization form"
                          loading="lazy"
                          decoding="async"
                          className="w-full max-w-[220px] aspect-[4/3] object-cover rounded-xl border border-border"
                        />
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
            )}

    </>
  );

  const view_dups = (
    <>
          {duplicates.length > 0 && (
            <section className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide">Other Agents With This Property</h3>
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white shrink-0"
                  style={{ background: "var(--accent)" }}
                >
                  {duplicates.length}
                </span>
              </div>
              <div className="divide-y divide-border border-t border-border">
                {duplicates.map((d) => (
                  <Link key={d.id} href={`/property/${d.id}`} className="flex items-center justify-between px-4 py-3 active:bg-surface-muted">
                    <div className="min-w-0 flex items-center gap-2">
                      <Avatar name={d.createdBy.name} avatarUrl={d.createdBy.avatarUrl} size={30} />
                      <div>
                        <div className="font-medium text-[14px]">{d.createdBy.name}</div>
                        <div className="text-[12px] text-muted">
                          {d.listingType === "RENT" ? `${formatQAR(d.rentPrice)}/mo` : formatQAR(d.salePrice)}
                        </div>
                      </div>
                      <WhatsAppButton number={d.createdBy.whatsapp} message={buildListingInquiryMessage(d, org.name)} size={30} />
                    </div>
                    <div className="text-[11px] text-muted shrink-0">{formatDate(d.createdAt)}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}

    </>
  );

  const view_hist = (
    <>
          {(isOwner || isAdmin) && auditLogs.length > 0 && (
            <section className="rounded-2xl border border-border bg-surface shadow-sm p-4">
              <button onClick={() => setShowHistory((s) => !s)} className="w-full flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide">Edit History</h3>
                <span className="text-muted text-sm">{showHistory ? "Hide ▲" : "Show ▼"}</span>
              </button>
              {showHistory && (
                <div className="flex flex-col gap-3 mt-3">
                  {auditLogs.map((entry) => (
                    <div key={entry.id} className="text-[13px] border-l-2 pl-3" style={{ borderColor: "var(--border)" }}>
                      <div className="text-foreground">{describeAuditEntry(entry)}</div>
                      <div className="text-muted text-[12px] mt-0.5">
                        {formatDateTime(entry.timestamp)} · by {entry.user.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

    </>
  );

  const view_actions = (
    <>
          {canManage && (
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => setEditing(true)}
                className="flex-1 rounded-xl py-3.5 text-[14px] font-semibold text-white active:opacity-80"
                style={{ background: "var(--primary)" }}
              >
                Edit Listing
              </button>
              <button
                onClick={toggleStatus}
                disabled={saving}
                className={`flex-1 rounded-xl py-3.5 text-[14px] font-semibold active:opacity-70 disabled:opacity-60 ${
                  listing.status === "ACTIVE" ? "bg-danger-bg text-danger" : "bg-success-bg"
                }`}
                style={listing.status === "INACTIVE" ? { color: "var(--success)" } : undefined}
              >
                {listing.status === "ACTIVE" ? "Deactivate Listing" : "Reactivate Listing"}
              </button>
            </div>
          )}
    </>
  );

  const price = isRent ? listing.rentPrice : listing.salePrice;
  const unitLine = unitSummary(listing, false);

  const desktopHeader = (
    <div className="pb-5 pt-8">
      <div className="mb-4 flex items-center gap-2 text-[13px] text-muted">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-1 font-medium transition-colors hover:text-slate-900">
          <IconChevronLeft size={15} />
          Back
        </button>
        <span className="text-slate-300">/</span>
        <Link href="/" className="transition-colors hover:text-slate-900">
          Properties
        </Link>
        <span className="text-slate-300">/</span>
        <span className="font-medium text-slate-700">{listingCode(listing.id)}</span>
      </div>

      <div className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <TypePill type={listing.listingType} />
            <AvailabilityPill status={listing.availabilityStatus} />
            {listing.visibility === "PRIVATE" && <PrivatePill />}
            {listing.unitDetailsPrivate && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-semibold leading-none text-muted">
                <IconLock size={11} /> Unit hidden
              </span>
            )}
            {listing.status === "INACTIVE" && <span className="rounded-full bg-danger-bg px-2.5 py-1 text-[11px] font-semibold leading-none text-danger">Inactive</span>}
          </div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">
            {listing.buildingName}
            {unitLine && <span className="font-normal text-muted"> · {unitLine}</span>}
          </h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-[14px] text-muted">
            <IconPin size={16} className="shrink-0" />
            {listing.area} → {listing.community}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5 pt-1">
          {session?.user?.id && (
            <>
              <button
                type="button"
                onClick={copyListingLink}
                aria-label="Copy listing link"
                title="Copy share link"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-600 shadow-[var(--shadow-card)] transition-colors hover:text-slate-900"
              >
                {linkCopied ? <IconCheck size={17} className="text-emerald-600" /> : <IconLink size={17} />}
              </button>
              <WhatsAppButton
                message={buildListingShareMessage(listing, buildListingShareUrl(listing, session.user.id), org.name)}
                ariaLabel="Share this listing on WhatsApp"
                size={44}
                className="!rounded-xl shadow-[var(--shadow-card)]"
              />
            </>
          )}
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "var(--primary)" }}
              >
                <IconEdit size={15} />
                Edit listing
              </button>
              <div className="rounded-xl bg-white shadow-[var(--shadow-card)]">
                <RowMenu
                  disabled={saving}
                  items={[
                    { label: "Publish to portals", onClick: () => router.push(`/property/${listing.id}/portals`) },
                    { label: listing.status === "ACTIVE" ? "Deactivate listing" : "Reactivate listing", onClick: toggleStatus, danger: listing.status === "ACTIVE", separator: true },
                  ]}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const factTiles = [
    { icon: <IconBuilding size={18} />, label: "Property type", value: PROPERTY_CATEGORY_LABELS[listing.propertyCategory] },
    ...(listing.propertyCategory !== "LAND" ? [{ icon: <IconBed size={18} />, label: "Bedrooms", value: listing.bedrooms ? BEDROOM_SHORT_LABELS[listing.bedrooms] : "—" }] : []),
    ...(listing.propertyCategory !== "LAND" ? [{ icon: <IconBath size={18} />, label: "Bathrooms", value: listing.bathrooms && listing.bathrooms !== "none" ? listing.bathrooms : "—" }] : []),
    { icon: <IconRuler size={18} />, label: "Size", value: listing.sizeSqm ? formatSqm(listing.sizeSqm) : "—" },
    ...(listing.propertyCategory !== "LAND" ? [{ icon: <IconCheck size={18} />, label: "Furnishing", value: listing.furnished === "FURNISHED" ? "Furnished" : "Unfurnished" }] : []),
    ...(isRent && listing.billsStatus ? [{ icon: <IconCheck size={18} />, label: "Bills", value: listing.billsStatus === "INCLUDED" ? "Included" : "Excluded" }] : []),
  ];

  const desktopFacts = (
    <section className="surface-card p-6">
      <h2 className="mb-4 text-[17px] font-semibold tracking-[-0.01em]">Overview</h2>
      <div className="grid grid-cols-2 gap-3 wide:grid-cols-3">
        {factTiles.map((f) => (
          <div key={f.label} className="flex items-center gap-3.5 rounded-xl bg-slate-50 px-4 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm">{f.icon}</span>
            <div className="min-w-0">
              <div className="text-[12px] text-muted">{f.label}</div>
              <div className="truncate text-[14.5px] font-semibold">{f.value}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const desktopDescription =
    listing.title || listing.description ? (
      <section className="surface-card p-6">
        <h2 className="mb-3 text-[17px] font-semibold tracking-[-0.01em]">About this property</h2>
        {listing.title && <p className="text-[18px] font-semibold leading-snug tracking-[-0.015em]">{listing.title}</p>}
        {listing.description && <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-foreground/80">{listing.description}</p>}
      </section>
    ) : null;

  const desktopAmenities =
    listing.amenities.length > 0 ? (
      <section className="surface-card p-6">
        <h2 className="mb-4 text-[17px] font-semibold tracking-[-0.01em]">Amenities</h2>
        <div className="grid grid-cols-3 gap-x-4 gap-y-3">
          {listing.amenities.map((a) => (
            <div key={a} className="flex items-center gap-2.5 text-[14px]">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-light text-primary">
                <IconCheck size={12} strokeWidth={3} />
              </span>
              {AMENITY_LABELS[a] ?? a}
            </div>
          ))}
        </div>
      </section>
    ) : null;

  const desktopPriceCard = (
    <div className="surface-card overflow-hidden">
      <div className="p-5">
        <div className="text-[12.5px] font-medium text-muted">{isRent ? "Rent" : "Price"}</div>
        <div className="tnum mt-1 text-[30px] font-semibold leading-none tracking-[-0.025em]">
          {formatQAR(price)}
          {isRent && <span className="ml-1.5 text-[16px] font-medium text-muted">/ month</span>}
        </div>
        {!isRent && listing.rentalValue && <div className="mt-2 text-[13.5px] text-muted">Rental value {formatQAR(listing.rentalValue)} / month</div>}
        <SaleDetailsSummary listing={listing} className="mt-4 border-t border-slate-100 pt-4" />
      </div>

      <div className="border-t border-slate-100 p-5">
        <div className="flex items-center gap-3">
          <Avatar name={listing.createdBy.name} avatarUrl={listing.createdBy.avatarUrl} size={40} />
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{listing.createdBy.name}</div>
            <div className="text-[12.5px] text-muted">{isOwner ? "You listed this property" : "Listing agent"}</div>
          </div>
        </div>
        {!isOwner && (
          <div className="mt-4 flex gap-2.5">
            <WhatsAppButton number={listing.createdBy.whatsapp} message={buildListingInquiryMessage(listing, org.name)} label="WhatsApp" variant="full" className="flex-1 justify-center py-3 text-[14px]" />
            <CallButton number={listing.createdBy.whatsapp} label="Call" variant="full" className="flex-1 justify-center py-3 text-[14px]" />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="px-4 pb-10 lg:px-0">
      {isDesktop && !editing ? (
        desktopHeader
      ) : (
      <div className="sticky top-0 z-20 bg-background safe-top pt-4 pb-3 flex items-center gap-3 lg:pt-8 lg:pb-5">
        <button type="button" onClick={() => router.back()} aria-label="Go back" className="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center shrink-0 active:opacity-70">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-lg font-bold truncate flex-1 lg:text-2xl lg:tracking-tight">{listing.buildingName}</h1>
        {listing.status === "INACTIVE" && (
          <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-danger-bg text-danger shrink-0">Inactive</span>
        )}
        {session?.user?.id && (
          <>
            <button
              type="button"
              onClick={copyListingLink}
              aria-label="Copy listing link"
              className="rounded-full flex items-center justify-center shrink-0 active:opacity-70"
              style={{ background: "var(--surface-muted)", color: "var(--foreground)", width: 34, height: 34 }}
            >
              {linkCopied ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.07 0l1.93-1.93a5 5 0 0 0-7.07-7.07L10.5 5.5" />
                  <path d="M14 11a5 5 0 0 0-7.07 0l-1.93 1.93a5 5 0 0 0 7.07 7.07L13.5 18.5" />
                </svg>
              )}
            </button>
            <WhatsAppButton
              message={buildListingShareMessage(listing, buildListingShareUrl(listing, session.user.id), org.name)}
              ariaLabel="Share this listing on WhatsApp"
              size={34}
              className="shrink-0"
            />
          </>
        )}
        {canManage && !editing && (
          <div className="hidden items-center gap-2 lg:flex">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--primary)" }}
            >
              <IconEdit size={15} />
              Edit listing
            </button>
            <button
              type="button"
              onClick={toggleStatus}
              disabled={saving}
              className={`rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-60 ${listing.status === "ACTIVE" ? "bg-danger-bg text-danger" : "bg-success-bg"}`}
              style={listing.status === "INACTIVE" ? { color: "var(--success)" } : undefined}
            >
              {listing.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        )}
      </div>
      )}

      {!editing ? (
        isDesktop ? (
          <div className="flex flex-col gap-6">
            <PhotoGalleryDesktop images={listing.images} height={400} />
            <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6">
            <div className="flex min-w-0 flex-col gap-5">
              {desktopFacts}
              {desktopDescription}
              {desktopAmenities}
              {view_info}
              {view_priv}
              {view_dups}
              {view_hist}
            </div>
            <div className="sticky top-6 flex flex-col gap-5">
              {desktopPriceCard}
              {view_avail}
              {view_portals}
            </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {view_gallery}
            {view_summary}
            {view_contact}
            {view_avail}
            {view_portals}
            {view_info}
            {view_priv}
            {view_dups}
            {view_hist}
            {view_actions}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-4 lg:grid lg:max-w-5xl lg:grid-cols-2 lg:items-start lg:gap-x-8 lg:gap-y-5">
          <section className="lg:col-span-2">
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">
              Photos
            </h3>
            <PhotoPicker images={images} onChange={setImages} />
          </section>

          <CollapsibleChipSelect
            label="Property Type"
            options={PROPERTY_TYPE_EDIT_OPTIONS}
            value={form.propertyCategory as PropertyCategory}
            onChange={(v) =>
              setForm((f) => {
                const category = v as PropertyCategory;
                const stillValid = isResidentialCategory(category) && bedroomOptionsFor(category).includes(f.bedrooms as BedroomCount);
                return {
                  ...f,
                  propertyCategory: v,
                  bedrooms: stillValid ? f.bedrooms : "",
                };
              })
            }
          />

          {form.propertyCategory && isResidentialCategory(form.propertyCategory as PropertyCategory) && (
            <CollapsibleChipSelect
              label="Bedrooms"
              placeholder="Select bedrooms"
              options={bedroomOptionsFor(form.propertyCategory as PropertyCategory).map((b) => ({ label: BEDROOM_LABELS[b], value: b }))}
              value={form.bedrooms}
              onChange={(v) => setForm((f) => ({ ...f, bedrooms: v }))}
            />
          )}

          {form.propertyCategory !== "LAND" && (
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Bathrooms</label>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="20"
                value={form.bathrooms}
                onChange={(e) => setForm((f) => ({ ...f, bathrooms: e.target.value }))}
                placeholder="2"
                className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
              />
            </div>
          )}

          <section className="lg:col-span-2">
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">
              Marketing <span className="text-muted font-normal normal-case">(optional, needed to publish to Property Finder)</span>
            </h3>
            <div className="flex flex-col gap-3">
              <div>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Listing title, e.g. Spacious 2BR with Marina View"
                  maxLength={50}
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
                />
                <div className="text-right text-[12px] text-muted mt-1">{form.title.length}/50</div>
              </div>
              <div>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the property..."
                  rows={4}
                  maxLength={2000}
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary resize-none"
                />
                <div className="text-right text-[12px] text-muted mt-1">{form.description.length}/2000</div>
              </div>
            </div>
          </section>

          <section>
            <label className="text-sm font-medium text-foreground block mb-1.5">
              Size
            </label>
            <div className="flex items-center rounded-xl border border-border bg-surface px-4">
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={form.sizeSqm}
                onChange={(e) => setForm((f) => ({ ...f, sizeSqm: e.target.value }))}
                placeholder="120"
                className="flex-1 min-w-0 py-3.5 outline-none bg-transparent text-base"
              />
              <span className="text-muted text-[13px]">sqm</span>
            </div>
          </section>

          {isRent ? (
            <section>
              <label className="text-sm font-medium text-foreground block mb-1.5">Rent Price (per month)</label>
              <div className="flex items-center rounded-xl border border-border bg-surface px-4">
                <span className="text-muted text-[15px] mr-1">QAR</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={form.rentPrice}
                  onChange={(e) => setForm((f) => ({ ...f, rentPrice: e.target.value }))}
                  className="flex-1 min-w-0 py-3.5 outline-none bg-transparent text-base"
                />
              </div>
            </section>
          ) : (
            <>
              <section>
                <label className="text-sm font-medium text-foreground block mb-1.5">Sale Price</label>
                <div className="flex items-center rounded-xl border border-border bg-surface px-4">
                  <span className="text-muted text-[15px] mr-1">QAR</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={form.salePrice}
                    onChange={(e) => setForm((f) => ({ ...f, salePrice: e.target.value }))}
                    className="flex-1 min-w-0 py-3.5 outline-none bg-transparent text-base"
                  />
                </div>
              </section>
              <section>
                <label className="text-sm font-medium text-foreground block mb-1.5">
                  Rental Value <span className="text-muted font-normal">(optional)</span>
                </label>
                <div className="flex items-center rounded-xl border border-border bg-surface px-4">
                  <span className="text-muted text-[15px] mr-1">QAR</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={form.rentalValue}
                    onChange={(e) => setForm((f) => ({ ...f, rentalValue: e.target.value }))}
                    className="flex-1 min-w-0 py-3.5 outline-none bg-transparent text-base"
                  />
                </div>
              </section>
              <section>
                <SaleDetailsFields value={form as unknown as SaleDetailsValue} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} showErrors={Boolean(error)} />
              </section>
            </>
          )}

          <section>
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">Availability</h3>
            <SegmentedControl
              options={availabilityOptionsFor(listing.listingType).map((opt) => ({
                label: AVAILABILITY_LABELS[opt],
                value: opt,
              }))}
              value={form.availabilityStatus as AvailabilityStatus}
              onChange={(v) => setForm((f) => ({ ...f, availabilityStatus: v }))}
            />
          </section>

          <section>
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">Visibility</h3>
            <VisibilityField value={form.visibility as ListingVisibility} onChange={(v) => setForm((f) => ({ ...f, visibility: v }))} />
          </section>

          {form.propertyCategory !== "LAND" && (
            <section>
              <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">Furnished</h3>
              <SegmentedControl
                options={[
                  { label: "Furnished", value: "FURNISHED" },
                  { label: "Unfurnished", value: "UNFURNISHED" },
                ]}
                value={form.furnished as "FURNISHED" | "UNFURNISHED"}
                onChange={(v) => setForm((f) => ({ ...f, furnished: v }))}
              />
            </section>
          )}

          {form.propertyCategory !== "LAND" && isRent && (
            <section>
              <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">Bills</h3>
              <SegmentedControl
                options={[
                  { label: "Included", value: "INCLUDED" },
                  { label: "Excluded", value: "EXCLUDED" },
                ]}
                value={form.billsStatus as "INCLUDED" | "EXCLUDED"}
                onChange={(v) => setForm((f) => ({ ...f, billsStatus: v }))}
              />
            </section>
          )}

          <section className="lg:col-span-2">
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">Location</h3>
            <div className="flex flex-col gap-3">
              <LocationCombinedInput
                area={form.area}
                community={form.community}
                onChange={(area, community) => setForm((f) => ({ ...f, area, community }))}
              />
              <LocationAutocomplete
                label={<>Building name <span className="font-normal text-muted">(optional)</span></>}
                placeholder="e.g. Marina Tower 5"
                area={form.area}
                community={form.community}
                value={form.buildingName}
                onChange={(v) => setForm((f) => ({ ...f, buildingName: v }))}
              />
              <div className="flex gap-3">
                {unitLabelFor(form.propertyCategory as PropertyCategory).showFloor && (
                  <div className="flex-1">
                    <label className="text-sm font-medium text-foreground block mb-1.5">Floor <span className="font-normal text-muted">(optional)</span></label>
                    <input
                      type="text"
                      value={form.floor}
                      onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
                    />
                  </div>
                )}
                <div className="flex-1">
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    {unitLabelFor(form.propertyCategory as PropertyCategory).unitLabel} <span className="font-normal text-muted">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.apartmentNumber}
                    onChange={(e) => setForm((f) => ({ ...f, apartmentNumber: e.target.value }))}
                    placeholder={unitLabelFor(form.propertyCategory as PropertyCategory).unitPlaceholder}
                    className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
                  />
                </div>
              </div>
              <UnitDetailsPrivacyField
                value={unitDetailsPrivate}
                onChange={setUnitDetailsPrivate}
                unitLabel={unitLabelFor(form.propertyCategory as PropertyCategory).unitLabel}
                showFloor={unitLabelFor(form.propertyCategory as PropertyCategory).showFloor}
              />
            </div>
          </section>

          <div className="lg:col-span-2">
            <PrivateDetailsSection value={privateDetails} onChange={setPrivateDetails} listingType={listing.listingType} />
          </div>

          {error && <div className="rounded-xl bg-danger-bg text-danger text-sm px-4 py-3 lg:col-span-2">{error}</div>}

          <div className="flex gap-3 mt-1 lg:col-span-2 lg:justify-end">
            <button
              onClick={() => {
                setEditing(false);
                setError("");
              }}
              className="flex-1 rounded-xl py-3.5 text-[14px] font-semibold text-foreground bg-surface-muted active:opacity-70"
            >
              Cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="flex-1 rounded-xl py-3.5 text-[14px] font-semibold text-white active:opacity-80 disabled:opacity-60"
              style={{ background: "var(--primary)" }}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
