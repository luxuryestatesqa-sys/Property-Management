"use client";

import Image from "next/image";
import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ListingDTO } from "@/lib/types";
import { formatQAR, formatSqm, listingCode } from "@/lib/format";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS, unitSummary } from "@/lib/propertyCategory";
import Avatar from "../Avatar";
import { AvailabilityPill, TypePill, PrivatePill } from "./Badges";
import { IconChevronRight, IconImage } from "./icons";

export interface TableColumn {
  key: string;
  header: string;
  className?: string;
  // hide this column below the xl breakpoint (narrow laptops) so the row actions stay visible
  xlOnly?: boolean;
  // hide below the `wide` breakpoint (1360px) so the table fits on laptops
  wideOnly?: boolean;
  render: (l: ListingDTO) => ReactNode;
}

export function PropertyCell({ listing }: { listing: ListingDTO }) {
  const cover = listing.images[0];
  const unitText = unitSummary(listing);
  return (
    <div className="flex min-w-0 items-center gap-3.5">
      <div className="relative h-14 w-[76px] shrink-0 overflow-hidden rounded-lg bg-surface-muted">
        {cover ? (
          <Image src={cover.url} alt="" fill sizes="76px" className={`object-cover ${listing.status === "INACTIVE" ? "grayscale" : ""}`} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted/50">
            <IconImage size={20} />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[14px] font-semibold text-foreground">
          {listing.buildingName}
          {unitText && <span className="font-normal text-muted"> · {unitText}</span>}
        </div>
        <div className="truncate text-[12.5px] text-muted">
          {listing.area} → {listing.community}
        </div>
        <div className="text-[11.5px] text-muted/80">{listingCode(listing.id)}</div>
      </div>
    </div>
  );
}

export function priceOf(l: ListingDTO) {
  const isRent = l.listingType === "RENT";
  return (
    <div className="whitespace-nowrap">
      <div className="text-[14px] font-semibold text-foreground">{formatQAR(isRent ? l.rentPrice : l.salePrice)}</div>
      {isRent && <div className="text-[11.5px] text-muted">per month</div>}
    </div>
  );
}

export const specsOf = (l: ListingDTO) => (
  <div className="whitespace-nowrap text-[13px]">
    <div className="text-foreground/90">
      {PROPERTY_CATEGORY_LABELS[l.propertyCategory]}
      {l.bedrooms && <span className="text-muted"> · {BEDROOM_SHORT_LABELS[l.bedrooms]}</span>}
    </div>
    {l.sizeSqm && <div className="text-[12px] text-muted">{formatSqm(l.sizeSqm)}</div>}
  </div>
);

export const agentOf = (l: ListingDTO) => (
  <div className="flex items-center gap-2">
    <Avatar name={l.createdBy.name} avatarUrl={l.createdBy.avatarUrl} size={26} />
    <span className="truncate text-[13px]">{l.createdBy.name}</span>
  </div>
);

const dateOf = (l: ListingDTO) => (
  <span className="whitespace-nowrap text-[12.5px] text-muted">
    {new Date(l.createdAt).toLocaleDateString("en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "short", year: "numeric" })}
  </span>
);

// Default columns for the company-wide Properties list.
export const PROPERTY_COLUMNS: TableColumn[] = [
  { key: "property", header: "Property", className: "w-[30%]", render: (l) => <PropertyCell listing={l} /> },
  {
    key: "specs",
    header: "Details",
    render: (l) => (
      <div className="flex flex-col items-start gap-1.5">
        <div className="flex items-center gap-1.5">
          <TypePill type={l.listingType} />
          {l.visibility === "PRIVATE" && <PrivatePill />}
        </div>
        {specsOf(l)}
      </div>
    ),
  },
  { key: "price", header: "Price", render: priceOf },
  { key: "status", header: "Status", render: (l) => <AvailabilityPill status={l.availabilityStatus} /> },
  { key: "agent", header: "Agent", render: agentOf },
  { key: "added", header: "Added", wideOnly: true, render: dateOf },
];

export default function ListingTable({
  listings,
  columns = PROPERTY_COLUMNS,
  dupCounts,
  trailing,
}: {
  listings: ListingDTO[];
  columns?: TableColumn[];
  // dupKey -> number of listings sharing it, to flag properties several agents list
  dupCounts?: Map<string, number>;
  // optional trailing cell (e.g. an actions menu); defaults to a chevron
  trailing?: (l: ListingDTO) => ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="surface-card overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-surface-muted/60 text-[11.5px] font-semibold uppercase tracking-wider text-muted">
            {columns.map((c) => (
              <th key={c.key} className={`whitespace-nowrap px-3 py-3 ${c.className ?? ""} ${c.xlOnly ? "hidden xl:table-cell" : ""} ${c.wideOnly ? "hidden wide:table-cell" : ""}`}>
                {c.header}
              </th>
            ))}
            <th className={trailing ? "px-3 py-3" : "w-10 px-3 py-3"} />
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => {
            const dups = dupCounts?.get(l.dupKey) ?? 1;
            return (
              <tr
                key={l.id}
                onClick={() => router.push(`/property/${l.id}`)}
                className="group cursor-pointer border-b border-border last:border-b-0 transition-colors hover:bg-accent-light/40"
              >
                {columns.map((c, i) => (
                  <td key={c.key} className={`px-3 py-3 align-middle ${c.className ?? ""} ${c.xlOnly ? "hidden xl:table-cell" : ""} ${c.wideOnly ? "hidden wide:table-cell" : ""}`}>
                    {c.render(l)}
                    {i === 0 && dups > 1 && (
                      <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: "var(--accent-light)", color: "var(--primary)" }}>
                        Listed by {dups} agents
                      </span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-3 text-right" onClick={trailing ? (e) => e.stopPropagation() : undefined}>
                  {trailing ? trailing(l) : <IconChevronRight size={16} className="text-muted/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
