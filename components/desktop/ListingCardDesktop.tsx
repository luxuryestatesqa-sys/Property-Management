"use client";

import { memo } from "react";
import Link from "next/link";
import { ListingDTO } from "@/lib/types";
import { formatQAR, formatSqm, listingCode } from "@/lib/format";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS, unitSummary } from "@/lib/propertyCategory";
import Avatar from "../Avatar";
import { AvailabilityPill, TypePill, PrivatePill } from "./Badges";
import { IconBed, IconBuilding, IconPin, IconRuler, IconImage } from "./icons";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function ListingCardDesktop({ listing }: { listing: ListingDTO }) {
  const isRent = listing.listingType === "RENT";
  const cover = listing.images[0];
  const unitText = unitSummary(listing);
  const price = isRent ? listing.rentPrice : listing.salePrice;

  return (
    <Link
      href={`/property/${listing.id}`}
      className="card-cv-compact group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(20,24,31,.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/70 hover:shadow-[0_14px_32px_-12px_rgba(20,24,31,.25)]"
    >
      <div className="relative aspect-[16/11] overflow-hidden bg-surface-muted">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.url}
            alt={listing.buildingName}
            loading="lazy"
            decoding="async"
            className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] ${listing.status === "INACTIVE" ? "grayscale" : ""}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted/50">
            <IconImage size={40} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <TypePill type={listing.listingType} solid />
          {listing.status === "INACTIVE" && (
            <span className="rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold leading-none text-white">Inactive</span>
          )}
        </div>
        <div className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium leading-none text-white backdrop-blur-sm">
          {listingCode(listing.id)}
        </div>

        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2 text-white">
          <div className="text-[22px] font-bold leading-none tracking-tight drop-shadow">
            {formatQAR(price)}
            {isRent && <span className="ml-1 text-[13px] font-medium opacity-90">/mo</span>}
          </div>
          <AvailabilityPill status={listing.availabilityStatus} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-[16px] font-semibold leading-snug text-foreground">
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

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={listing.createdBy.name} avatarUrl={listing.createdBy.avatarUrl} size={24} />
            <span className="truncate text-[12.5px] font-medium text-foreground/80">{listing.createdBy.name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {listing.visibility === "PRIVATE" && <PrivatePill />}
            <span className="text-[12px] text-muted">{shortDate(listing.createdAt)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default memo(ListingCardDesktop);
