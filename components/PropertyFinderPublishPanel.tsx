"use client";

import { useRouter } from "next/navigation";
import { ListingDTO, PropertyFinderListingDTO } from "@/lib/types";
import { getPfStatus, PF_TONE_COLORS } from "@/lib/propertyFinder/status";

interface PropertyFinderPublishPanelProps {
  listing: ListingDTO;
  state: PropertyFinderListingDTO | null;
  readOnly?: boolean;
}

// A short summary card on the listing detail page - the actual mapping
// review, field editing, and publish/unpublish actions all live on their own
// dedicated page (app/property/[id]/propertyfinder), which has the room a
// task with this many moving parts needs.
export default function PropertyFinderPublishPanel({ listing, state, readOnly }: PropertyFinderPublishPanelProps) {
  const router = useRouter();
  const pfView = getPfStatus(state);
  const badge = pfView.kind === "not_published" ? null : { label: pfView.label, ...PF_TONE_COLORS[pfView.tone] };
  const enabled = pfView.active;

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide">Property Finder</h3>
        {badge ? (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: badge.bg, color: badge.text }}>
            {badge.label}
          </span>
        ) : (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-surface-muted text-muted">
            Off
          </span>
        )}
      </div>

      {state?.lastError && <p className="text-[13px] text-danger mt-2 line-clamp-2">{state.lastError}</p>}

      {!readOnly && (
        <button
          type="button"
          onClick={() => router.push(`/property/${listing.id}/propertyfinder`)}
          className="w-full rounded-xl py-3 mt-3 text-[14px] font-semibold text-white active:opacity-80"
          style={{ background: "var(--primary)" }}
        >
          {enabled ? "Manage Property Finder Listing" : "Publish to Property Finder"}
        </button>
      )}
    </section>
  );
}
