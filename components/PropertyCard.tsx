"use client";

import { memo } from "react";
import Link from "next/link";
import { ListingDTO } from "@/lib/types";
import { formatQAR, formatSqm, listingCode } from "@/lib/format";
import { AVAILABILITY_LABELS, AVAILABILITY_COLORS } from "@/lib/availability";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS, unitLabelFor } from "@/lib/propertyCategory";

function PropertyCard({ listing }: { listing: ListingDTO }) {
  const isRent = listing.listingType === "RENT";
  const availabilityColor = AVAILABILITY_COLORS[listing.availabilityStatus];
  const cover = listing.images[0];
  const unit = unitLabelFor(listing.propertyCategory);

  const detailParts = [
    PROPERTY_CATEGORY_LABELS[listing.propertyCategory],
    listing.bedrooms ? BEDROOM_SHORT_LABELS[listing.bedrooms] : null,
    listing.sizeSqm ? formatSqm(listing.sizeSqm) : null,
  ].filter(Boolean);

  const unitLine = `${listing.buildingName} · ${unit.unitShortLabel} ${listing.apartmentNumber}${
    unit.showFloor ? `, Fl ${listing.floor}` : ""
  }`;

  return (
    <Link
      href={`/property/${listing.id}`}
      className="card-cv-compact flex gap-3 rounded-xl bg-surface border border-border shadow-sm p-2.5 active:opacity-80 transition-opacity"
    >
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

        <div className="flex items-center justify-between gap-2">
          <span className="text-[14px] font-bold text-foreground truncate">
            {isRent ? `${formatQAR(listing.rentPrice)}/mo` : formatQAR(listing.salePrice)}
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

export default memo(PropertyCard);
