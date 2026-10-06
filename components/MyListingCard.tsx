"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useState } from "react";
import { ListingDTO, AvailabilityStatus } from "@/lib/types";
import { formatQAR, formatSqm, listingCode } from "@/lib/format";
import { AVAILABILITY_LABELS, AVAILABILITY_COLORS, availabilityOptionsFor } from "@/lib/availability";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS, unitSummary } from "@/lib/propertyCategory";
import { useConfirm } from "@/components/ConfirmDialog";
import { extractErrorMessage } from "@/lib/errors";

function MyListingCard({ listing, onStatusChange }: { listing: ListingDTO; onStatusChange: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const isRent = listing.listingType === "RENT";
  const confirm = useConfirm();
  const availabilityColor = AVAILABILITY_COLORS[listing.availabilityStatus];

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

  async function deleteListing() {
    setMenuOpen(false);
    const confirmed = await confirm({
      title: "Delete Listing?",
      message: "This permanently removes it, including its photos and history - it can't be undone. If it's currently on Property Finder, it will be unpublished first. Deactivate instead if you might want it back.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/listings/${listing.id}`, { method: "DELETE" });
      if (res.ok) {
        onStatusChange();
      } else {
        const data = await res.json().catch(() => null);
        setDeleteError(extractErrorMessage(data?.error, "Failed to delete listing"));
      }
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

  const unitText = unitSummary(listing);
  const unitLine = unitText ? `${listing.buildingName} · ${unitText}` : listing.buildingName;

  return (
    <div className="relative card-cv-compact rounded-xl bg-surface border border-border shadow-sm p-2.5">
      <div className="absolute top-2 right-2 z-10">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          disabled={busy}
          aria-label="Listing options"
          className="w-7 h-7 rounded-full flex items-center justify-center active:opacity-70 disabled:opacity-60 bg-surface/90 text-muted shadow-sm"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-border bg-surface shadow-lg overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  router.push(`/property/${listing.id}?edit=1`);
                }}
                className="w-full text-left px-4 py-3 text-[13px] font-medium active:bg-surface-muted"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  router.push(`/property/${listing.id}/portals`);
                }}
                className="w-full text-left px-4 py-3 text-[13px] font-medium active:bg-surface-muted border-t border-border"
              >
                Publish to Portals
              </button>
              <button
                type="button"
                onClick={deleteListing}
                className="w-full text-left px-4 py-3 text-[13px] font-medium text-danger active:bg-surface-muted border-t border-border"
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>

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
          <div className="flex items-start justify-between gap-1.5 pr-7">
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
            {listing.visibility === "PRIVATE" && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap bg-surface-muted text-muted">🔒 PRIVATE</span>
            )}
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

      {deleteError && <p className="text-[12px] text-danger mt-2">{deleteError}</p>}

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
          href={`/property/${listing.id}?edit=1`}
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
