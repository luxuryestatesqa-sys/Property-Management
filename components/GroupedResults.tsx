"use client";

import { memo } from "react";
import Link from "next/link";
import { ListingDTO } from "@/lib/types";
import { formatQAR, formatDate, listingCode } from "@/lib/format";
import PropertyCard from "./PropertyCard";
import WhatsAppButton from "./WhatsAppButton";
import Avatar from "./Avatar";
import { buildListingInquiryMessage } from "@/lib/whatsapp";

function groupByDupKey(listings: ListingDTO[]): ListingDTO[][] {
  const order: string[] = [];
  const map = new Map<string, ListingDTO[]>();
  for (const l of listings) {
    if (!map.has(l.dupKey)) {
      map.set(l.dupKey, []);
      order.push(l.dupKey);
    }
    map.get(l.dupKey)!.push(l);
  }
  return order.map((k) => map.get(k)!);
}

const DuplicateGroupCard = memo(function DuplicateGroupCard({ group }: { group: ListingDTO[] }) {
  const first = group[0];
  const isRent = (l: ListingDTO) => l.listingType === "RENT";

  const cover = group.map((l) => l.images[0]).find(Boolean);

  return (
    <div className="card-cv rounded-2xl border-2 overflow-hidden shadow-sm" style={{ borderColor: "var(--accent)" }}>
      <div className="px-4 py-3 flex items-center gap-3" style={{ background: "var(--accent-light)" }}>
        {cover && (
          <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover.url} alt={first.buildingName} className="w-full h-full object-cover" loading="lazy" decoding="async" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[14px] truncate" style={{ color: "var(--primary)" }}>
            {first.buildingName} — Apartment {first.apartmentNumber}
          </div>
          <div className="text-[12px] text-muted truncate">
            📍 {first.area} → {first.community} · Floor {first.floor}
          </div>
        </div>
        <span
          className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full text-white"
          style={{ background: "var(--accent)" }}
        >
          {group.length} Listings
        </span>
      </div>
      <div className="divide-y divide-border bg-surface">
        {group.map((l) => (
          <Link key={l.id} href={`/property/${l.id}`} className="flex items-center justify-between px-4 py-3 active:bg-surface-muted">
            <div className="min-w-0 flex items-center gap-2">
              <Avatar name={l.createdBy.name} avatarUrl={l.createdBy.avatarUrl} size={30} />
              <div className="min-w-0">
                <div className="font-medium text-[14px] truncate">{l.createdBy.name}</div>
                <div className="text-[12px] text-muted">
                  {isRent(l) ? "For Rent" : "For Sale"} — {isRent(l) ? `${formatQAR(l.rentPrice)}/mo` : formatQAR(l.salePrice)}
                </div>
              </div>
              <WhatsAppButton number={l.createdBy.whatsapp} message={buildListingInquiryMessage(l)} size={28} />
            </div>
            <div className="text-right shrink-0 ml-2">
              <div className="text-[11px] text-muted">Added: {formatDate(l.createdAt)}</div>
              <div className="text-[11px] text-muted mt-0.5">{listingCode(l.id)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
});

export default function GroupedResults({ listings }: { listings: ListingDTO[] }) {
  const groups = groupByDupKey(listings);

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) =>
        group.length > 1 ? (
          <DuplicateGroupCard key={group[0].dupKey} group={group} />
        ) : (
          <PropertyCard key={group[0].id} listing={group[0]} />
        )
      )}
    </div>
  );
}
