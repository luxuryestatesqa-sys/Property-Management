"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ListingDTO, AuditLogDTO, AvailabilityStatus, PropertyCategory, BedroomCount } from "@/lib/types";
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
  NO_FLOOR_VALUE,
} from "@/lib/propertyCategory";
import SegmentedControl from "@/components/SegmentedControl";
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
import PrivateDetailsSection, { EMPTY_PRIVATE_DETAILS, PrivateDetailsValue } from "@/components/PrivateDetailsSection";
import PropertyDetailSkeleton from "@/components/PropertyDetailSkeleton";

const PROPERTY_TYPE_EDIT_OPTIONS = PROPERTY_CATEGORY_OPTIONS.map((c) => ({ label: PROPERTY_CATEGORY_LABELS[c], value: c }));

export default function PropertyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const confirm = useConfirm();
  const id = params.id as string;

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
        sizeSqm: data.listing.sizeSqm ? String(data.listing.sizeSqm) : "",
        area: data.listing.area,
        community: data.listing.community,
        buildingName: data.listing.buildingName,
        floor: data.listing.floor,
        apartmentNumber: data.listing.apartmentNumber,
        rentPrice: data.listing.rentPrice ? String(data.listing.rentPrice) : "",
        salePrice: data.listing.salePrice ? String(data.listing.salePrice) : "",
        rentalValue: data.listing.rentalValue ? String(data.listing.rentalValue) : "",
        furnished: data.listing.furnished,
        billsStatus: data.listing.billsStatus ?? "INCLUDED",
        availabilityStatus: data.listing.availabilityStatus,
      });
      const urls = data.listing.images.map((img: { url: string }) => img.url);
      setImages(urls);
      setInitialImages(urls);
      setCanViewPrivateDetails(Boolean(data.canViewPrivateDetails));
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
  const isAdmin = session?.user?.role === "ADMIN";
  const canManage = isOwner || isAdmin;
  const isRent = listing.listingType === "RENT";

  async function saveEdit() {
    setError("");
    if (isResidentialCategory(form.propertyCategory as PropertyCategory) && !form.bedrooms) {
      setError("Bedrooms is required for this property type.");
      return;
    }
    setSaving(true);
    try {
      const category = form.propertyCategory as PropertyCategory;
      const body: Record<string, unknown> = {
        propertyCategory: category,
        bedrooms: isResidentialCategory(category) ? form.bedrooms || null : null,
        sizeSqm: form.sizeSqm ? Number(form.sizeSqm) : null,
        area: form.area,
        community: form.community,
        buildingName: form.buildingName,
        floor: unitLabelFor(category).showFloor ? form.floor : NO_FLOOR_VALUE,
        apartmentNumber: form.apartmentNumber,
        furnished: form.furnished,
        billsStatus: isRent ? form.billsStatus : null,
        availabilityStatus: form.availabilityStatus,
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
        body.images = images;
      }
      if (isRent) {
        body.rentPrice = Number(form.rentPrice);
      } else {
        body.salePrice = Number(form.salePrice);
        body.rentalValue = form.rentalValue ? Number(form.rentalValue) : null;
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
      await navigator.clipboard.writeText(buildListingShareUrl(listing.id, session.user.id));
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

  return (
    <div className="px-4 pb-10">
      <div className="sticky top-0 z-20 bg-background safe-top pt-4 pb-3 flex items-center gap-3">
        <button type="button" onClick={() => router.back()} aria-label="Go back" className="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center shrink-0 active:opacity-70">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--foreground)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-lg font-bold truncate flex-1">{listing.buildingName}</h1>
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
              message={buildListingShareMessage(listing, buildListingShareUrl(listing.id, session.user.id))}
              ariaLabel="Share this listing on WhatsApp"
              size={34}
              className="shrink-0"
            />
          </>
        )}
      </div>

      {!editing ? (
        <div className="flex flex-col gap-4">
          <PhotoGallery images={listing.images} />

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
            </div>

            <div className="text-[26px] font-extrabold text-foreground mt-2.5 leading-tight">
              {isRent ? `${formatQAR(listing.rentPrice)}/month` : formatQAR(listing.salePrice)}
            </div>
            {!isRent && listing.rentalValue && (
              <div className="text-[13px] text-muted mt-0.5">Rental Value: {formatQAR(listing.rentalValue)}/month</div>
            )}

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
              {listing.buildingName} · {unitLabelFor(listing.propertyCategory).unitShortLabel} {listing.apartmentNumber}
              {unitLabelFor(listing.propertyCategory).showFloor && `, Floor ${listing.floor}`}
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

          {!isOwner && (
            <div className="flex gap-2.5">
              <WhatsAppButton
                number={listing.createdBy.whatsapp}
                message={buildListingInquiryMessage(listing)}
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

          {canManage && (
            <section className="rounded-2xl border border-border bg-surface shadow-sm p-4">
              <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Availability</h3>
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
                {availabilityOptionsFor(listing.listingType).map((opt) => {
                  const active = opt === listing.availabilityStatus;
                  const color = AVAILABILITY_COLORS[opt];
                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={availabilityBusy}
                      onClick={() => changeAvailability(opt)}
                      className="shrink-0 text-[13px] font-semibold px-4 py-2.5 rounded-xl active:opacity-70 disabled:opacity-60"
                      style={active ? { background: color.bg, color: color.text } : { background: "var(--surface-muted)", color: "var(--muted)" }}
                    >
                      {AVAILABILITY_LABELS[opt]}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

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
                      <WhatsAppButton number={d.createdBy.whatsapp} message={buildListingInquiryMessage(d)} size={30} />
                    </div>
                    <div className="text-[11px] text-muted shrink-0">{formatDate(d.createdAt)}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}

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
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <section>
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">
              Photos <span className="text-muted font-normal normal-case">(optional)</span>
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

          <section>
            <label className="text-sm font-medium text-foreground block mb-1.5">
              Size <span className="text-muted font-normal">(optional)</span>
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

          <section>
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">Location</h3>
            <div className="flex flex-col gap-3">
              <LocationCombinedInput
                area={form.area}
                community={form.community}
                onChange={(area, community) => setForm((f) => ({ ...f, area, community }))}
              />
              <LocationAutocomplete
                label="Building Name"
                placeholder="e.g. Marina Tower 5"
                area={form.area}
                community={form.community}
                value={form.buildingName}
                onChange={(v) => setForm((f) => ({ ...f, buildingName: v }))}
              />
              <div className="flex gap-3">
                {unitLabelFor(form.propertyCategory as PropertyCategory).showFloor && (
                  <div className="flex-1">
                    <label className="text-sm font-medium text-foreground block mb-1.5">Floor</label>
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
                    {unitLabelFor(form.propertyCategory as PropertyCategory).unitLabel}
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
            </div>
          </section>

          <PrivateDetailsSection value={privateDetails} onChange={setPrivateDetails} listingType={listing.listingType} />

          {error && <div className="rounded-xl bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>}

          <div className="flex gap-3 mt-1">
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
