"use client";

import { useRouter } from "next/navigation";
import { ListingDTO, PropertyFinderListingDTO } from "@/lib/types";

interface PropertyFinderPublishPanelProps {
  listing: ListingDTO;
  state: PropertyFinderListingDTO | null;
}

const STATE_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  pending_publishing: { label: "Publishing…", bg: "var(--accent-light)", text: "var(--primary)" },
  live: { label: "Live", bg: "var(--success-bg)", text: "var(--success)" },
  publishing_failed: { label: "Failed", bg: "var(--danger-bg)", text: "var(--danger)" },
  unpublished: { label: "Unpublished", bg: "var(--surface-muted)", text: "var(--muted)" },
};

// A short summary card on the listing detail page - the actual mapping
// review, field editing, and publish/unpublish actions all live on their own
// dedicated page (app/property/[id]/propertyfinder), which has the room a
// task with this many moving parts needs.
export default function PropertyFinderPublishPanel({ listing, state }: PropertyFinderPublishPanelProps) {
  const router = useRouter();
  const badge = state?.state ? STATE_LABELS[state.state] : null;
  const enabled = state?.enabled ?? false;

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide">Property Finder</h3>
        {badge && (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: badge.bg, color: badge.text }}>
            {badge.label}
          </span>
        )}
      </div>

      {state?.lastError && <p className="text-[13px] text-danger mt-2 line-clamp-2">{state.lastError}</p>}

      <button
        type="button"
        onClick={() => router.push(`/property/${listing.id}/propertyfinder`)}
        className="w-full rounded-xl py-3 mt-3 text-[14px] font-semibold text-white active:opacity-80"
        style={{ background: "var(--primary)" }}
      >
        {enabled ? "Manage Property Finder Listing" : "Publish to Property Finder"}
      </button>
    </section>
  );
}
