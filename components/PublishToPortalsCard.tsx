"use client";

import { useRouter } from "next/navigation";
import { ListingDTO } from "@/lib/types";
import { getPfStatus, PF_TONE_COLORS } from "@/lib/propertyFinder/status";

interface PublishToPortalsCardProps {
  listing: ListingDTO;
  readOnly?: boolean;
}

export default function PublishToPortalsCard({ listing, readOnly }: PublishToPortalsCardProps) {
  const router = useRouter();

  const pfView = getPfStatus(listing.propertyFinderState);
  const pfEnabled = pfView.active;
  const pfBadge = pfView.kind === "not_published" ? null : { label: pfView.kind === "live" ? "Live" : pfView.label, ...PF_TONE_COLORS[pfView.tone] };

  const websiteLive = listing.channelStates?.WEBSITE?.enabled ?? false;
  const qatarLivingLive = listing.channelStates?.QATAR_LIVING?.enabled ?? false;
  const oryxLive = listing.channelStates?.PROPERTY_ORYX?.enabled ?? false;

  const otherLive = listing.channelStates?.OTHER_PORTALS?.enabled ?? false;

  const activeCount = [pfEnabled, websiteLive, qatarLivingLive, oryxLive, otherLive].filter(Boolean).length;
  const allPublished = activeCount === 5;

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm p-4.5 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-bold text-foreground">Publish to Portals</h3>
            <span
              className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
              style={{
                background: activeCount > 0 ? "var(--success-bg)" : "var(--surface-muted)",
                color: activeCount > 0 ? "var(--success)" : "var(--muted)",
              }}
            >
              {activeCount} of 5 Active
            </span>
          </div>
          <p className="text-[12px] text-muted mt-0.5">Manage distribution across Property Finder, Website, Qatar Living, Oryx & other portals</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="rounded-xl border border-border bg-surface-muted/60 p-2.5 flex flex-col justify-between min-h-[60px]">
          <span className="text-[11px] font-semibold text-muted">Property Finder</span>
          <div>
            {pfView.kind === "live" ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-1" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
                ✓ Live on Property Finder
              </span>
            ) : pfBadge ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full inline-block mt-1" style={{ background: pfBadge.bg, color: pfBadge.text }}>
                {pfBadge.label}
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-muted inline-block mt-1">Off</span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-muted/60 p-2.5 flex flex-col justify-between min-h-[60px]">
          <span className="text-[11px] font-semibold text-muted">Website</span>
          <div>
            <span className="text-[10px] font-bold inline-block mt-1 px-2 py-0.5 rounded-full" style={{ background: websiteLive ? "var(--success-bg)" : "transparent", color: websiteLive ? "var(--success)" : "var(--muted)" }}>
              {websiteLive ? "✓ Already Published" : "Off"}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-muted/60 p-2.5 flex flex-col justify-between min-h-[60px]">
          <span className="text-[11px] font-semibold text-muted">Qatar Living</span>
          <div>
            <span className="text-[10px] font-bold inline-block mt-1 px-2 py-0.5 rounded-full" style={{ background: qatarLivingLive ? "var(--success-bg)" : "transparent", color: qatarLivingLive ? "var(--success)" : "var(--muted)" }}>
              {qatarLivingLive ? "✓ Already Published" : "Off"}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-muted/60 p-2.5 flex flex-col justify-between min-h-[60px]">
          <span className="text-[11px] font-semibold text-muted">Property Oryx</span>
          <div>
            <span className="text-[10px] font-bold inline-block mt-1 px-2 py-0.5 rounded-full" style={{ background: oryxLive ? "var(--success-bg)" : "transparent", color: oryxLive ? "var(--success)" : "var(--muted)" }}>
              {oryxLive ? "✓ Already Published" : "Off"}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-muted/60 p-2.5 flex flex-col justify-between min-h-[60px]">
          <span className="text-[11px] font-semibold text-muted">Other Portals</span>
          <div>
            <span className="text-[10px] font-bold inline-block mt-1 px-2 py-0.5 rounded-full" style={{ background: otherLive ? "var(--success-bg)" : "transparent", color: otherLive ? "var(--success)" : "var(--muted)" }}>
              {otherLive ? "✓ Already Published" : "Off"}
            </span>
          </div>
        </div>
      </div>

      {!readOnly && (
        <button
          type="button"
          onClick={() => router.push(`/property/${listing.id}/portals`)}
          className="w-full rounded-xl py-3.5 px-4 text-[14px] font-bold text-white flex items-center justify-center gap-2 active:opacity-80 shadow-sm transition-all"
          style={{ background: allPublished ? "var(--success)" : "var(--primary)" }}
        >
          <span>{allPublished ? "Already Published (Manage Portals)" : "Publish to Portals"}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </section>
  );
}
