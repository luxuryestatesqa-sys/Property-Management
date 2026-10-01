"use client";

import { useState } from "react";
import { ListingDTO, PullChannel } from "@/lib/types";
import { extractErrorMessage } from "@/lib/errors";

interface ChannelsPanelProps {
  listing: ListingDTO;
  readOnly?: boolean;
  onChanged?: (updated: ListingDTO["channelStates"][PullChannel], portal: PullChannel) => void;
}

const PULL_CHANNEL_LABELS: Record<PullChannel, string> = {
  WEBSITE: "Website",
  QATAR_LIVING: "Qatar Living",
  PROPERTY_ORYX: "Property Oryx",
};

// The 3 channels that are just a PortalListing.enabled flag - read directly
// by the public listing page (WEBSITE) or that portal's own feed
// (app/feeds/[portal]), no external API call involved. Property Finder is
// the 4th channel an agent ticks, but keeps its own richer panel
// (PropertyFinderPublishPanel, rendered alongside this one) since publishing
// there is a real synchronous push with its own account/mapping setup.
export default function ChannelsPanel({ listing, readOnly, onChanged }: ChannelsPanelProps) {
  const [busy, setBusy] = useState<PullChannel | null>(null);
  const [reasons, setReasons] = useState<Record<string, string[]>>({});

  async function toggle(portal: PullChannel, nextEnabled: boolean) {
    if (readOnly) return;
    setBusy(portal);
    setReasons((r) => ({ ...r, [portal]: [] }));
    try {
      const res = await fetch(`/api/listings/${listing.id}/channels/${portal}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.reasons) setReasons((r) => ({ ...r, [portal]: data.reasons }));
        else setReasons((r) => ({ ...r, [portal]: [extractErrorMessage(data?.error, "Failed to update channel")] }));
        return;
      }
      if (data?.channelState && onChanged) {
        onChanged(data.channelState, portal);
      }
    } catch (err) {
      setReasons((r) => ({ ...r, [portal]: [err instanceof Error ? err.message : "Network error. Please try again."] }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm p-4">
      <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Other Channels</h3>
      <div className="flex flex-col gap-2">
        {(Object.keys(PULL_CHANNEL_LABELS) as PullChannel[]).map((portal) => {
          const enabled = listing.channelStates?.[portal]?.enabled ?? false;
          return (
            <div key={portal} className="flex flex-col gap-1 py-1 border-t border-border first:border-t-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-medium">{PULL_CHANNEL_LABELS[portal]}</span>
                {readOnly ? (
                  <span
                    className="shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-lg"
                    style={enabled ? { background: "var(--success-bg)", color: "var(--success)" } : { background: "var(--surface-muted)", color: "var(--muted)" }}
                  >
                    {enabled ? "Live" : "Off"}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy === portal}
                    onClick={() => toggle(portal, !enabled)}
                    className="shrink-0 text-[12px] font-semibold px-3 py-2 rounded-lg active:opacity-70 disabled:opacity-60"
                    style={enabled ? { background: "var(--success-bg)", color: "var(--success)" } : { background: "var(--surface-muted)", color: "var(--muted)" }}
                  >
                    {busy === portal ? "Saving..." : enabled ? "Live" : "Off"}
                  </button>
                )}
              </div>
              {reasons[portal]?.length > 0 && <p className="text-[12px] text-danger">Still needed: {reasons[portal].join(", ")}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
