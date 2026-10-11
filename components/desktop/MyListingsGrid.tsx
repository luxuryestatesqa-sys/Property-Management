"use client";

import Link from "next/link";
import { ListingDTO } from "@/lib/types";
import { formatQAR, formatSqm, listingCode } from "@/lib/format";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS, unitSummary } from "@/lib/propertyCategory";
import { TypePill, PrivatePill } from "./Badges";
import { AvailabilitySelect, PortalsCell, RowActions } from "./MyListingsTable";
import { IconBed, IconBuilding, IconImage, IconPin, IconRuler } from "./icons";

function Card({ listing, onChange }: { listing: ListingDTO; onChange: () => void }) {
  const isRent = listing.listingType === "RENT";
  const cover = listing.images[0];
  const unitText = unitSummary(listing);
  const price = isRent ? listing.rentPrice : listing.salePrice;

  return (
    <div className="flex flex-col rounded-[20px] bg-surface shadow-[var(--shadow-card)] transition-shadow duration-300 hover:shadow-[var(--shadow-card-hover)]">
      <Link href={`/property/${listing.id}`} className="group relative block aspect-[16/10] overflow-hidden rounded-t-[20px] bg-surface-muted">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.url} alt={listing.buildingName} loading="lazy" decoding="async" className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] ${listing.status === "INACTIVE" ? "grayscale" : ""}`} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted/50">
            <IconImage size={40} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <TypePill type={listing.listingType} solid />
          {listing.visibility === "PRIVATE" && <PrivatePill />}
          {listing.status === "INACTIVE" && <span className="rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold leading-none text-white">Inactive</span>}
        </div>
        <div className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium leading-none text-white backdrop-blur-sm">{listingCode(listing.id)}</div>
        <div className="tnum absolute bottom-3 left-3 text-[22px] font-semibold leading-none tracking-tight text-white drop-shadow">
          {formatQAR(price)}
          {isRent && <span className="ml-1 text-[13px] font-medium opacity-90">/mo</span>}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-[16px] font-semibold leading-snug">
            {listing.buildingName}
            {unitText && <span className="font-normal text-muted"> · {unitText}</span>}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 truncate text-[13px] text-muted">
            <IconPin size={14} className="shrink-0" />
            <span className="truncate">
              {listing.area} <span className="opacity-60">→</span> {listing.community}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-foreground/80">
          <span className="inline-flex items-center gap-1.5">
            <IconBuilding size={15} className="text-muted" />
            {PROPERTY_CATEGORY_LABELS[listing.propertyCategory]}
          </span>
          {listing.bedrooms && (
            <span className="inline-flex items-center gap-1.5">
              <IconBed size={15} className="text-muted" />
              {BEDROOM_SHORT_LABELS[listing.bedrooms]}
            </span>
          )}
          {listing.sizeSqm && (
            <span className="inline-flex items-center gap-1.5">
              <IconRuler size={15} className="text-muted" />
              {formatSqm(listing.sizeSqm)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <AvailabilitySelect listing={listing} onChange={onChange} />
          <PortalsCell listing={listing} />
        </div>

        <div className="border-t border-border pt-3">
          <RowActions listing={listing} onChange={onChange} />
        </div>
      </div>
    </div>
  );
}

export default function MyListingsGrid({ listings, onChange }: { listings: ListingDTO[]; onChange: () => void }) {
  return (
    <div className="stagger grid grid-cols-3 gap-6">
      {listings.map((l) => (
        <Card key={l.id} listing={l} onChange={onChange} />
      ))}
    </div>
  );
}
