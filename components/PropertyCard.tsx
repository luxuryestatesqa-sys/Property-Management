"use client";

import Link from "next/link";
import { ListingDTO } from "@/lib/types";
import { formatQAR, formatSqm, formatDate, listingCode } from "@/lib/format";
import { AVAILABILITY_LABELS, AVAILABILITY_COLORS } from "@/lib/availability";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS, unitLabelFor } from "@/lib/propertyCategory";
import WhatsAppButton from "./WhatsAppButton";
import Avatar from "./Avatar";
import { buildListingInquiryMessage } from "@/lib/whatsapp";

export default function PropertyCard({ listing }: { listing: ListingDTO }) {
  const isRent = listing.listingType === "RENT";
  const availabilityColor = AVAILABILITY_COLORS[listing.availabilityStatus];
  const cover = listing.images[0];
  const unit = unitLabelFor(listing.propertyCategory);

  return (
    <Link
      href={`/property/${listing.id}`}
      className="block rounded-2xl bg-surface border border-border overflow-hidden active:opacity-80"
    >
      <div className="relative aspect-[16/10] bg-surface-muted">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.url} alt={listing.buildingName} className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl text-border">🏠</div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground text-[15px] truncate">{listing.buildingName}</h3>
            <p className="text-[13px] text-muted mt-0.5 flex items-center gap-1 truncate">
              <span>📍</span>
              <span className="truncate">
                {listing.area} → {listing.community}
              </span>
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <span
              className="text-[11px] font-semibold px-2 py-1 rounded-lg"
              style={{
                background: isRent ? "var(--rent-bg)" : "var(--sale-bg)",
                color: isRent ? "var(--rent-text)" : "var(--sale-text)",
              }}
            >
              {isRent ? "FOR RENT" : "FOR SALE"}
            </span>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-lg"
              style={{ background: availabilityColor.bg, color: availabilityColor.text }}
            >
              {AVAILABILITY_LABELS[listing.availabilityStatus]}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-2.5 text-[13px] text-muted flex-wrap">
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
          <span className="w-1 h-1 rounded-full bg-border" />
          <span>
            {unit.unitShortLabel} {listing.apartmentNumber}
          </span>
          {unit.showFloor && (
            <>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>Floor {listing.floor}</span>
            </>
          )}
        </div>

        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="text-lg font-bold text-foreground">
              {isRent ? `${formatQAR(listing.rentPrice)}/mo` : formatQAR(listing.salePrice)}
            </div>
            {!isRent && listing.rentalValue && (
              <div className="text-[12px] text-muted mt-0.5">Rental Value: {formatQAR(listing.rentalValue)}/mo</div>
            )}
          </div>
          {listing.propertyCategory !== "LAND" && (
            <div className="flex gap-1.5 flex-wrap justify-end">
              <span className="text-[11px] px-2 py-1 rounded-lg bg-surface-muted text-muted">
                {listing.furnished === "FURNISHED" ? "Furnished" : "Unfurnished"}
              </span>
              <span className="text-[11px] px-2 py-1 rounded-lg bg-surface-muted text-muted">
                Bills {listing.billsStatus === "INCLUDED" ? "Included" : "Excluded"}
              </span>
            </div>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-1.5">
            <Avatar name={listing.createdBy.name} avatarUrl={listing.createdBy.avatarUrl} size={20} />
            <div className="text-[12px] text-muted truncate">
              Added by <span className="font-medium text-foreground">{listing.createdBy.name}</span> · {formatDate(listing.createdAt)}
            </div>
            <WhatsAppButton number={listing.createdBy.whatsapp} message={buildListingInquiryMessage(listing)} size={28} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-muted">{listingCode(listing.id)}</span>
            {listing.status === "INACTIVE" && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-danger-bg text-danger">Inactive</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
