"use client";

import Image from "next/image";
import { memo } from "react";
import Link from "next/link";
import { ListingDTO } from "@/lib/types";
import { formatQAR, formatSqm, listingCode } from "@/lib/format";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS, unitSummary } from "@/lib/propertyCategory";
import Avatar from "../Avatar";
import { AvailabilityPill, TypePill, PrivatePill } from "./Badges";
import { IconBed, IconBuilding, IconPin, IconRuler, IconImage } from "./icons";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "short" });
}

function ListingCardDesktop({ listing, compact = false }: { listing: ListingDTO; compact?: boolean }) {
  const isRent = listing.listingType === "RENT";
  const cover = listing.images[0];
  const unitText = unitSummary(listing);
  const price = isRent ? listing.rentPrice : listing.salePrice;

  return (
    <Link
      href={`/property/${listing.id}`}
      className="card-cv-compact group flex flex-col overflow-hidden rounded-[18px] card-hover border border-border bg-surface"
    >
      <div className={`relative overflow-hidden bg-surface-muted ${compact ? "aspect-[4/3]" : "aspect-[16/10] wide:aspect-[16/11]"}`}>
        {cover ? (
          <Image
            src={cover.url}
            alt={listing.buildingName}
            fill
            sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
            className={`object-cover transition-transform duration-500 group-hover:scale-[1.04] ${listing.status === "INACTIVE" ? "grayscale" : ""}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted/50">
            <IconImage size={40} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/[0.06]" />

        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <TypePill type={listing.listingType} solid />
          {listing.status === "INACTIVE" && (
            <span className="rounded-full bg-[rgba(13,31,92,0.72)] px-2.5 py-1 text-[11px] font-semibold leading-none text-white">Inactive</span>
          )}
        </div>
        <div className="absolute right-3 top-3 rounded-full bg-[rgba(13,31,92,0.55)] px-2.5 py-1 text-[11px] font-medium leading-none text-white backdrop-blur-sm">
          {listingCode(listing.id)}
        </div>

        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2 text-white">
          <div className={`tnum font-semibold leading-none tracking-tight drop-shadow ${compact ? "text-[18px]" : "text-[22px]"}`}>
            {formatQAR(price)}
            {isRent && <span className="ml-1 text-[13px] font-medium opacity-90">/mo</span>}
          </div>
          <AvailabilityPill status={listing.availabilityStatus} />
        </div>
      </div>

      <div className={`flex flex-1 flex-col ${compact ? "gap-2 p-3" : "gap-3 p-4"}`}>
        <div className="min-w-0">
          <h3 className={`truncate font-semibold leading-snug text-foreground ${compact ? "text-[14.5px]" : "text-[16px]"}`}>
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

        <div className={`flex flex-wrap items-center gap-y-1 text-foreground/80 ${compact ? "gap-x-3 text-[12px]" : "gap-x-4 text-[13px]"}`}>
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
