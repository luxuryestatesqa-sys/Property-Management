"use client";

import Link from "next/link";
import { memo, useState } from "react";
import { ListingDTO, AvailabilityStatus } from "@/lib/types";
import { formatQAR, formatSqm, listingCode } from "@/lib/format";
import { AVAILABILITY_LABELS, AVAILABILITY_COLORS, availabilityOptionsFor } from "@/lib/availability";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS, unitLabelFor } from "@/lib/propertyCategory";
import { useConfirm } from "@/components/ConfirmDialog";

function MyListingCard({ listing, onStatusChange }: { listing: ListingDTO; onStatusChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const isRent = listing.listingType === "RENT";
  const confirm = useConfirm();
  const availabilityColor = AVAILABILITY_COLORS[listing.availabilityStatus];
  const unit = unitLabelFor(listing.propertyCategory);

  async function toggleStatus() {
    const nextStatus = listing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const confirmed =
      nextStatus === "INACTIVE"
        ? await confirm({
            title: "Deactivate Listing?",
            message: "It will be hidden from active search. You can reactivate it anytime.",
            confirmLabel: "Deactivate",
            danger: true,
          })
        : await confirm({
            title: "Reactivate Listing?",
            message: "It will become visible in active search results again.",
            confirmLabel: "Reactivate",
          });
    if (!confirmed) return;
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

  const detailParts = [
    PROPERTY_CATEGORY_LABELS[listing.propertyCategory],
    listing.bedrooms ? BEDROOM_SHORT_LABELS[listing.bedrooms] : null,
    listing.sizeSqm ? formatSqm(listing.sizeSqm) : null,
  ].filter(Boolean);

  const unitLine = `${listing.buildingName} · ${unit.unitShortLabel} ${listing.apartmentNumber}${
    unit.showFloor ? `, Fl ${listing.floor}` : ""
  }`;

  return (
    <div className="card-cv-compact rounded-xl bg-surface border border-border shadow-sm p-2.5">
      <Link href={`/property/${listing.id}`} className="flex gap-3">
        <div className="relative shrink-0 w-[95px] h-[85px] sm:w-[136px] sm:h-[108px] rounded-lg overflow-hidden bg-surface-muted">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.url} alt={listing.buildingName} className="w-full h-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl text-border">🏠</div>
          )}
          {listing.status === "INACTIVE" && (
            <span className="absolute bottom-1 left-1 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-black/60 text-white">
              Inactive
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-1.5">
            <span className="text-[11px] font-semibold text-muted shrink-0">{listingCode(listing.id)}</span>
            <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
                style={{
                  background: isRent ? "var(--rent-bg)" : "var(--sale-bg)",
                  color: isRent ? "var(--rent-text)" : "var(--sale-text)",
                }}
              >
                {isRent ? "FOR RENT" : "FOR SALE"}
              </span>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
                style={{ background: availabilityColor.bg, color: availabilityColor.text }}
              >
                {AVAILABILITY_LABELS[listing.availabilityStatus]}
              </span>
            </div>
          </div>

          <p className="text-[12px] text-muted truncate leading-tight">
            📍 {listing.area} → {listing.community}
          </p>

          <p className="text-[12px] text-muted truncate leading-tight">{detailParts.join(" • ")}</p>

          <p className="text-[13px] font-semibold text-foreground truncate leading-tight">{unitLine}</p>

          <span className="text-[14px] font-bold text-foreground truncate">
            {isRent ? `${formatQAR(listing.rentPrice)}/mo` : formatQAR(listing.salePrice)}
          </span>
        </div>
      </Link>

      <div className="mt-2.5 pt-2.5 border-t border-border">
        <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1.5">Availability</div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
          {availabilityOptionsFor(listing.listingType).map((opt) => {
            const active = opt === listing.availabilityStatus;
            const color = AVAILABILITY_COLORS[opt];
            return (
              <button
                key={opt}
                type="button"
                disabled={busy}
                onClick={() => changeAvailability(opt)}
                className="shrink-0 text-[12px] font-medium px-2.5 py-1.5 rounded-lg disabled:opacity-60"
                style={active ? { background: color.bg, color: color.text } : { background: "var(--surface-muted)", color: "var(--muted)" }}
              >
                {AVAILABILITY_LABELS[opt]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 mt-2.5 pt-2.5 border-t border-border">
        <Link
          href={`/property/${listing.id}`}
          className="flex-1 text-center rounded-lg py-2 text-[13px] font-semibold text-white active:opacity-80"
          style={{ background: "var(--primary)" }}
        >
          Edit
        </Link>
        <button
          onClick={toggleStatus}
          disabled={busy}
          className={`flex-1 rounded-lg py-2 text-[13px] font-semibold active:opacity-70 disabled:opacity-60 ${
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

export default memo(MyListingCard);
