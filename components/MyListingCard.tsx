"use client";

import Link from "next/link";
import { useState } from "react";
import { ListingDTO, AvailabilityStatus } from "@/lib/types";
import { formatQAR, formatSqm, formatDate, listingCode } from "@/lib/format";
import { AVAILABILITY_LABELS, AVAILABILITY_COLORS, availabilityOptionsFor } from "@/lib/availability";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS } from "@/lib/propertyCategory";

export default function MyListingCard({ listing, onStatusChange }: { listing: ListingDTO; onStatusChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const isRent = listing.listingType === "RENT";

  async function toggleStatus() {
    const nextStatus = listing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const msg = nextStatus === "INACTIVE" ? "Deactivate this listing?" : "Reactivate this listing?";
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/listings/${listing.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) onStatusChange();
    } finally {
      setBusy(false);
    }
  }

  async function changeAvailability(next: AvailabilityStatus) {
    if (next === listing.availabilityStatus) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availabilityStatus: next }),
      });
      if (res.ok) onStatusChange();
    } finally {
      setBusy(false);
    }
  }

  const cover = listing.images[0];

  return (
    <div className="rounded-2xl bg-surface border border-border p-4">
      <Link href={`/property/${listing.id}`} className="block">
        <div className="flex items-start justify-between gap-2">
          <div className="shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-surface-muted flex items-center justify-center">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover.url} alt={listing.buildingName} className="w-full h-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <span className="text-xl text-border">🏠</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-[15px] truncate">{listing.buildingName}</h3>
            <p className="text-[13px] text-muted mt-0.5 truncate">
              📍 {listing.area} → {listing.community}
            </p>
            <p className="text-[13px] text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>{PROPERTY_CATEGORY_LABELS[listing.propertyCategory]}</span>
              {listing.bedrooms && (
                <>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span>{BEDROOM_SHORT_LABELS[listing.bedrooms]}</span>
                </>
              )}
              {listing.sizeSqm && (
                <>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span>{formatSqm(listing.sizeSqm)}</span>
                </>
              )}
            </p>
            <p className="text-[13px] text-muted mt-0.5">
              Apt {listing.apartmentNumber} · Floor {listing.floor}
            </p>
          </div>
          <span
            className="shrink-0 text-[11px] font-semibold px-2 py-1 rounded-lg"
            style={{
              background: isRent ? "var(--rent-bg)" : "var(--sale-bg)",
              color: isRent ? "var(--rent-text)" : "var(--sale-text)",
            }}
          >
            {isRent ? "FOR RENT" : "FOR SALE"}
          </span>
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-lg font-bold">{isRent ? `${formatQAR(listing.rentPrice)}/mo` : formatQAR(listing.salePrice)}</span>
          <span className="text-[11px] text-muted">{listingCode(listing.id)}</span>
        </div>
        <div className="text-[12px] text-muted mt-1">Added: {formatDate(listing.createdAt)}</div>
      </Link>

      <div className="mt-3 pt-3 border-t border-border">
        <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5">Availability</div>
        <div className="flex flex-wrap gap-1.5">
          {availabilityOptionsFor(listing.listingType).map((opt) => {
            const active = opt === listing.availabilityStatus;
            const color = AVAILABILITY_COLORS[opt];
            return (
              <button
                key={opt}
                type="button"
                disabled={busy}
                onClick={() => changeAvailability(opt)}
                className="text-[12px] font-medium px-2.5 py-1.5 rounded-lg disabled:opacity-60"
                style={active ? { background: color.bg, color: color.text } : { background: "var(--surface-muted)", color: "var(--muted)" }}
              >
                {AVAILABILITY_LABELS[opt]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 mt-3 pt-3 border-t border-border">
        <Link
          href={`/property/${listing.id}`}
          className="flex-1 text-center rounded-lg py-2.5 text-[13px] font-semibold text-white active:opacity-80"
          style={{ background: "var(--primary)" }}
        >
          Edit
        </Link>
        <button
          onClick={toggleStatus}
          disabled={busy}
          className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold active:opacity-70 disabled:opacity-60 ${
            listing.status === "ACTIVE" ? "bg-danger-bg text-danger" : "bg-success-bg"
          }`}
          style={listing.status === "INACTIVE" ? { color: "var(--success)" } : undefined}
        >
          {busy ? "..." : listing.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
        </button>
      </div>
    </div>
  );
}
