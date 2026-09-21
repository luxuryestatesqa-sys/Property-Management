"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ListingDTO, AuditLogDTO, AvailabilityStatus, PropertyCategory } from "@/lib/types";
import { formatQAR, formatSqm, formatDate, formatDateTime, listingCode } from "@/lib/format";
import { describeAuditEntry } from "@/lib/audit";
import { extractErrorMessage } from "@/lib/errors";
import { AVAILABILITY_LABELS, AVAILABILITY_COLORS, availabilityOptionsFor } from "@/lib/availability";
import {
  PROPERTY_CATEGORY_LABELS,
  PROPERTY_CATEGORY_OPTIONS,
  BEDROOM_LABELS,
  BEDROOM_OPTIONS,
  BEDROOM_SHORT_LABELS,
  isResidentialCategory,
} from "@/lib/propertyCategory";
import SegmentedControl from "@/components/SegmentedControl";
import CollapsibleChipSelect from "@/components/CollapsibleChipSelect";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import WhatsAppButton from "@/components/WhatsAppButton";
import Avatar from "@/components/Avatar";
import PhotoPicker from "@/components/PhotoPicker";
import PhotoGallery from "@/components/PhotoGallery";

const PROPERTY_TYPE_EDIT_OPTIONS = PROPERTY_CATEGORY_OPTIONS.map((c) => ({ label: PROPERTY_CATEGORY_LABELS[c], value: c }));
const BEDROOM_EDIT_OPTIONS = BEDROOM_OPTIONS.map((b) => ({ label: BEDROOM_LABELS[b], value: b }));

export default function PropertyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const id = params.id as string;

  const [listing, setListing] = useState<ListingDTO | null>(null);
  const [duplicates, setDuplicates] = useState<ListingDTO[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const [form, setForm] = useState<Record<string, string>>({});
  const [images, setImages] = useState<string[]>([]);
  const [initialImages, setInitialImages] = useState<string[]>([]);

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
        billsStatus: data.listing.billsStatus,
        availabilityStatus: data.listing.availabilityStatus,
      });
      const urls = data.listing.images.map((img: { url: string }) => img.url);
      setImages(urls);
      setInitialImages(urls);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="px-4 py-6">
        <div className="h-8 w-40 bg-surface-muted rounded-lg animate-pulse mb-4" />
        <div className="h-40 bg-surface-muted rounded-2xl animate-pulse mb-3" />
        <div className="h-40 bg-surface-muted rounded-2xl animate-pulse" />
      </div>
    );
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
        floor: form.floor,
        apartmentNumber: form.apartmentNumber,
        furnished: form.furnished,
        billsStatus: form.billsStatus,
        availabilityStatus: form.availabilityStatus,
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

  async function toggleStatus() {
    if (!listing) return;
    const nextStatus = listing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const confirmMsg =
      nextStatus === "INACTIVE"
        ? "Deactivate this listing? It will be hidden from active search but kept in the database."
        : "Reactivate this listing?";
    if (!window.confirm(confirmMsg)) return;
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
        <button type="button" onClick={() => router.back()} aria-label="Go back" className="w-9 h-9 rounded-full bg-surface-muted flex items-center justify-center shrink-0">
          ←
        </button>
        <h1 className="text-lg font-bold truncate flex-1">{listing.buildingName}</h1>
        {listing.status === "INACTIVE" && (
          <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-danger-bg text-danger shrink-0">Inactive</span>
        )}
      </div>

      {!editing ? (
        <div className="flex flex-col gap-4">
          <PhotoGallery images={listing.images} />

          <div className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: "var(--primary)" }}>
            <div className="px-4 py-3" style={{ background: "var(--primary)" }}>
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: isRent ? "#ffffff" : "var(--accent)", color: isRent ? "var(--rent-text)" : "#ffffff" }}
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
              <div className="text-2xl font-bold text-white mt-2">
                {isRent ? `${formatQAR(listing.rentPrice)}/month` : formatQAR(listing.salePrice)}
              </div>
              {!isRent && listing.rentalValue && (
                <div className="text-[13px] mt-0.5" style={{ color: "var(--accent-light)" }}>
                  Rental Value: {formatQAR(listing.rentalValue)}/month
                </div>
              )}
            </div>
            <div className="bg-surface px-4 py-3 flex gap-2 flex-wrap">
              <span className="text-[12px] px-2.5 py-1 rounded-lg bg-surface-muted text-foreground">
                {PROPERTY_CATEGORY_LABELS[listing.propertyCategory]}
              </span>
              {listing.bedrooms && (
                <span className="text-[12px] px-2.5 py-1 rounded-lg bg-surface-muted text-foreground">
                  {BEDROOM_SHORT_LABELS[listing.bedrooms]}
                </span>
              )}
              {listing.sizeSqm && (
                <span className="text-[12px] px-2.5 py-1 rounded-lg bg-surface-muted text-foreground">
                  {formatSqm(listing.sizeSqm)}
                </span>
              )}
              {listing.propertyCategory !== "LAND" && (
                <>
                  <span className="text-[12px] px-2.5 py-1 rounded-lg bg-surface-muted text-foreground">
                    {listing.furnished === "FURNISHED" ? "Furnished" : "Unfurnished"}
                  </span>
                  <span className="text-[12px] px-2.5 py-1 rounded-lg bg-surface-muted text-foreground">
                    Bills {listing.billsStatus === "INCLUDED" ? "Included" : "Excluded"}
                  </span>
                </>
              )}
            </div>
          </div>

          <section className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Location</h3>
            <dl className="flex flex-col gap-2.5 text-[14px]">
              <div className="flex justify-between">
                <dt className="text-muted">Location</dt>
                <dd className="font-medium text-right">{listing.area}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Area / Community</dt>
                <dd className="font-medium text-right">{listing.community}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Building Name</dt>
                <dd className="font-medium text-right">{listing.buildingName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Floor</dt>
                <dd className="font-medium text-right">{listing.floor}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Apartment No.</dt>
                <dd className="font-medium text-right">{listing.apartmentNumber}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Listing Information</h3>
            <dl className="flex flex-col gap-2.5 text-[14px]">
              <div className="flex justify-between">
                <dt className="text-muted">Listing ID</dt>
                <dd className="font-medium">{listingCode(listing.id)}</dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-muted">Added By</dt>
                <dd className="font-medium flex items-center gap-2">
                  <Avatar name={listing.createdBy.name} avatarUrl={listing.createdBy.avatarUrl} size={24} />
                  {listing.createdBy.name}
                  {!isOwner && <WhatsAppButton number={listing.createdBy.whatsapp} name={listing.createdBy.name} size={30} />}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Original Added Date</dt>
                <dd className="font-medium">{formatDate(listing.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Original Added Time</dt>
                <dd className="font-medium">{formatDateTime(listing.createdAt).split(", ")[1]}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Last Updated</dt>
                <dd className="font-medium">{formatDateTime(listing.updatedAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Availability</dt>
                <dd className="font-semibold" style={{ color: AVAILABILITY_COLORS[listing.availabilityStatus].text }}>
                  {AVAILABILITY_LABELS[listing.availabilityStatus]}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Status</dt>
                <dd className={`font-semibold ${listing.status === "ACTIVE" ? "" : "text-danger"}`} style={listing.status === "ACTIVE" ? { color: "var(--success)" } : undefined}>
                  {listing.status === "ACTIVE" ? "Active" : "Inactive"}
                </dd>
              </div>
            </dl>
          </section>

          {duplicates.length > 0 && (
            <section className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: "var(--accent)" }}>
              <div className="px-4 py-2.5" style={{ background: "var(--accent-light)" }}>
                <h3 className="text-[13px] font-bold" style={{ color: "var(--primary)" }}>
                  Other Agents With This Property ({duplicates.length})
                </h3>
              </div>
              <div className="divide-y divide-border bg-surface">
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
                      <WhatsAppButton number={d.createdBy.whatsapp} name={d.createdBy.name} size={30} />
                    </div>
                    <div className="text-[11px] text-muted shrink-0">{formatDate(d.createdAt)}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {(isOwner || isAdmin) && auditLogs.length > 0 && (
            <section className="rounded-2xl border border-border bg-surface p-4">
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
              setForm((f) => ({
                ...f,
                propertyCategory: v,
                bedrooms: isResidentialCategory(v) ? f.bedrooms : "",
              }))
            }
          />

          {form.propertyCategory && isResidentialCategory(form.propertyCategory as PropertyCategory) && (
            <CollapsibleChipSelect
              label="Bedrooms"
              placeholder="Select bedrooms"
              options={BEDROOM_EDIT_OPTIONS}
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
            <>
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
            </>
          )}

          <section>
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">Location</h3>
            <div className="flex flex-col gap-3">
              <LocationAutocomplete
                label="Location"
                placeholder="e.g. Lusail"
                level="area"
                value={form.area}
                onChange={(v) => setForm((f) => ({ ...f, area: v }))}
              />
              <LocationAutocomplete
                label="Area / Community"
                placeholder="e.g. Marina District"
                level="community"
                area={form.area}
                value={form.community}
                onChange={(v) => setForm((f) => ({ ...f, community: v }))}
              />
              <LocationAutocomplete
                label="Building Name"
                placeholder="e.g. Marina Tower 5"
                level="building"
                area={form.area}
                community={form.community}
                value={form.buildingName}
                onChange={(v) => setForm((f) => ({ ...f, buildingName: v }))}
              />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-sm font-medium text-foreground block mb-1.5">Floor</label>
                  <input
                    type="text"
                    value={form.floor}
                    onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))}
                    className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium text-foreground block mb-1.5">Apartment No.</label>
                  <input
                    type="text"
                    value={form.apartmentNumber}
                    onChange={(e) => setForm((f) => ({ ...f, apartmentNumber: e.target.value }))}
                    className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          </section>

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
