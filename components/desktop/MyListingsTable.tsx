"use client";

import { useState } from "react";
import Link from "next/link";
import { ListingDTO, AvailabilityStatus } from "@/lib/types";
import { AVAILABILITY_LABELS, AVAILABILITY_COLORS, availabilityOptionsFor } from "@/lib/availability";
import { useListingActions } from "../useListingActions";
import ListingTable, { PropertyCell, priceOf, specsOf, TableColumn } from "./ListingTable";
import { TypePill, PrivatePill } from "./Badges";
import { IconDots, IconEdit, IconGlobe } from "./icons";

// Availability control: looks like a status pill, behaves like a select.
export function AvailabilitySelect({ listing, onChange }: { listing: ListingDTO; onChange: () => void }) {
  const { busy, changeAvailability } = useListingActions(listing, onChange);
  const c = AVAILABILITY_COLORS[listing.availabilityStatus];
  return (
    <div className="relative inline-block">
      <select
        value={listing.availabilityStatus}
        disabled={busy}
        onChange={(e) => changeAvailability(e.target.value as AvailabilityStatus)}
        aria-label="Availability"
        className="cursor-pointer appearance-none rounded-full py-1.5 pl-3 pr-7 text-[12px] font-semibold outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        style={{ background: c.bg, color: c.text, fontSize: 12 }}
      >
        {availabilityOptionsFor(listing.listingType).map((opt) => (
          <option key={opt} value={opt}>
            {AVAILABILITY_LABELS[opt]}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={c.text} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

export function PortalsCell({ listing }: { listing: ListingDTO }) {
  const pf = listing.propertyFinderState;
  const live = pf?.state === "live";
  const website = listing.channelStates?.WEBSITE?.enabled;
  if (!pf?.state && !website) return <span className="text-[12.5px] text-muted">Not published</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      {pf?.state && (
        <span
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={live ? { background: "var(--success-bg)", color: "var(--success)" } : { background: "var(--surface-muted)", color: "var(--muted)" }}
        >
          <IconGlobe size={11} />
          Property Finder: {pf.state.replace(/_/g, " ")}
        </span>
      )}
      {website && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-muted">
          <IconGlobe size={11} />
          Website
        </span>
      )}
    </div>
  );
}

export function RowActions({ listing, onChange }: { listing: ListingDTO; onChange: () => void }) {
  const { busy, deleteError, toggleStatus, deleteListing } = useListingActions(listing, onChange);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Link
        href={`/property/${listing.id}?edit=1`}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: "var(--primary)" }}
      >
        <IconEdit size={13} />
        Edit
      </Link>
      <Link
        href={`/property/${listing.id}/portals`}
        className="rounded-lg bg-surface-muted px-3 py-2 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-border"
      >
        Publish
      </Link>
      <button
        type="button"
        disabled={busy}
        aria-label="More actions"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.right, y: r.bottom + 6 });
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
      >
        <IconDots size={16} />
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div className="fixed z-50 w-48 -translate-x-full overflow-hidden rounded-xl border border-border bg-surface shadow-xl" style={{ left: menu.x, top: menu.y }}>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                toggleStatus();
              }}
              className="w-full px-4 py-2.5 text-left text-[13px] font-medium hover:bg-surface-muted"
            >
              {listing.status === "ACTIVE" ? "Deactivate listing" : "Reactivate listing"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                deleteListing();
              }}
              className="w-full border-t border-border px-4 py-2.5 text-left text-[13px] font-medium text-danger hover:bg-danger-bg"
            >
              Delete listing
            </button>
          </div>
        </>
      )}
      {deleteError && <span className="text-[12px] text-danger">{deleteError}</span>}
    </div>
  );
}

export default function MyListingsTable({ listings, onChange }: { listings: ListingDTO[]; onChange: () => void }) {
  const columns: TableColumn[] = [
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
    { key: "avail", header: "Availability", render: (l) => <AvailabilitySelect listing={l} onChange={onChange} /> },
    { key: "portals", header: "Published on", xlOnly: true, render: (l) => <PortalsCell listing={l} /> },
  ];
  return <ListingTable listings={listings} columns={columns} trailing={(l) => <RowActions listing={l} onChange={onChange} />} />;
}
