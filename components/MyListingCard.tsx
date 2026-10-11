"use client";

import Link from "next/link";
import { memo, useState } from "react";
import { createPortal } from "react-dom";
import { ListingDTO } from "@/lib/types";
import { formatQAR, formatSqm, listingCode } from "@/lib/format";
import { AVAILABILITY_LABELS, AVAILABILITY_COLORS, availabilityOptionsFor } from "@/lib/availability";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS, unitSummary } from "@/lib/propertyCategory";
import { useListingActions } from "@/components/useListingActions";

// Same card as the Properties list; the three dots at the bottom right open the owner's actions.
function MyListingCard({ listing, onStatusChange }: { listing: ListingDTO; onStatusChange: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isRent = listing.listingType === "RENT";
  const availabilityColor = AVAILABILITY_COLORS[listing.availabilityStatus];
  const { busy, deleteError, toggleStatus, deleteListing, changeAvailability } = useListingActions(listing, onStatusChange);

  const cover = listing.images[0];
  const detailParts = [
    PROPERTY_CATEGORY_LABELS[listing.propertyCategory],
    listing.bedrooms ? BEDROOM_SHORT_LABELS[listing.bedrooms] : null,
    listing.sizeSqm ? formatSqm(listing.sizeSqm) : null,
  ].filter(Boolean);
  const unitText = unitSummary(listing);
  const unitLine = unitText ? `${listing.buildingName} · ${unitText}` : listing.buildingName;
  const active = listing.status === "ACTIVE";

  const item = "flex w-full items-center gap-3.5 px-5 py-3.5 text-left text-[15px] font-medium active:bg-surface-muted";
  const icon = (d: string) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500">
      <path d={d} />
    </svg>
  );

  const sheet = (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-900/45" onClick={() => setMenuOpen(false)}>
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-surface pb-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-200" />
        <div className="px-5 pb-2 pt-4">
          <div className="text-[12px] font-semibold text-muted">{listingCode(listing.id)}</div>
          <div className="truncate text-[17px] font-semibold">{unitLine}</div>
        </div>

        <div className="px-5 pb-3 pt-2">
          <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">Availability</div>
          <div className="flex flex-wrap gap-2">
            {availabilityOptionsFor(listing.listingType).map((opt) => {
              const on = opt === listing.availabilityStatus;
              const color = AVAILABILITY_COLORS[opt];
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setMenuOpen(false);
                    await changeAvailability(opt);
                  }}
                  className="rounded-full px-4 py-2 text-[13.5px] font-medium disabled:opacity-60"
                  style={on ? { background: color.bg, color: color.text } : { background: "var(--surface-muted)", color: "var(--muted)" }}
                >
                  {AVAILABILITY_LABELS[opt]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-slate-100">
          <Link href={`/property/${listing.id}?edit=1`} className={item}>
            {icon("M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z")}
            Edit listing
          </Link>
          <Link href={`/property/${listing.id}/portals`} className={item}>
            {icon("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18")}
            Publish to portals
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setMenuOpen(false);
              await toggleStatus();
            }}
            className={`${item} ${active ? "" : ""}`}
            style={active ? undefined : { color: "var(--success)" }}
          >
            {icon(active ? "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM5.6 5.6l12.8 12.8" : "M5 12.5l4.5 4.5L19 7.5")}
            {active ? "Deactivate" : "Reactivate"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setMenuOpen(false);
              await deleteListing();
            }}
            className={`${item} text-danger`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
            </svg>
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative">
      <Link
        href={`/property/${listing.id}`}
        className="card-cv-compact flex gap-3 rounded-xl border border-border bg-surface p-2.5 shadow-sm transition-opacity active:opacity-80"
      >
        <div className="relative h-[85px] w-[95px] shrink-0 overflow-hidden rounded-lg bg-surface-muted sm:h-[108px] sm:w-[136px]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.url} alt={listing.buildingName} className="h-full w-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-border">🏠</div>
          )}
          {!active && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">Inactive</span>}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div className="flex items-start justify-between gap-1.5">
            <span className="shrink-0 text-[11px] font-semibold text-muted">{listingCode(listing.id)}</span>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              <span className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: isRent ? "var(--rent-bg)" : "var(--sale-bg)", color: isRent ? "var(--rent-text)" : "var(--sale-text)" }}>
                {isRent ? "FOR RENT" : "FOR SALE"}
              </span>
              <span className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: availabilityColor.bg, color: availabilityColor.text }}>
                {AVAILABILITY_LABELS[listing.availabilityStatus]}
              </span>
              {listing.visibility === "PRIVATE" && <span className="whitespace-nowrap rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-bold text-muted">🔒 PRIVATE</span>}
            </div>
          </div>
          <p className="truncate text-[12px] leading-tight text-muted">
            📍 {listing.area} → {listing.community}
          </p>
          <p className="truncate text-[12px] leading-tight text-muted">{detailParts.join(" • ")}</p>
          <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{unitLine}</p>
          <span className="truncate pr-9 text-[14px] font-bold text-foreground">{isRent ? `${formatQAR(listing.rentPrice)}/mo` : formatQAR(listing.salePrice)}</span>
        </div>
      </Link>

      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        disabled={busy}
        aria-label="Manage listing"
        className="absolute bottom-1.5 right-1.5 flex h-9 w-9 items-center justify-center rounded-full text-muted active:bg-surface-muted disabled:opacity-60"
      >
        {busy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-transparent" />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.9" />
            <circle cx="12" cy="12" r="1.9" />
            <circle cx="12" cy="19" r="1.9" />
          </svg>
        )}
      </button>

      {deleteError && <p className="mt-1.5 px-1 text-[12px] text-danger">{deleteError}</p>}
      {menuOpen && typeof document !== "undefined" && createPortal(sheet, document.body)}
    </div>
  );
}

export default memo(MyListingCard);
