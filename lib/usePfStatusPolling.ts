"use client";

import { useEffect, useRef } from "react";
import type { PropertyFinderListingDTO } from "@/lib/types";
import { getPfStatus } from "@/lib/propertyFinder/status";

// While Property Finder is still processing a publish, keeps asking it for
// the real stage so the page flips to "Live" on its own instead of sitting on
// "Publishing…" until the agent reloads. Every 8s for the first ~2 minutes,
// then every 30s up to ~12 minutes in total - PF can take a while.
export function usePfStatusPolling(
  listingId: string | number | undefined,
  state: PropertyFinderListingDTO | null | undefined,
  onState: (state: PropertyFinderListingDTO | null) => void
) {
  const publishing = getPfStatus(state).kind === "publishing";
  const onStateRef = useRef(onState);
  useEffect(() => {
    onStateRef.current = onState;
  });

  useEffect(() => {
    if (!publishing || listingId === undefined) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      attempts++;
      try {
        const res = await fetch(`/api/listings/${listingId}/propertyfinder/refresh`, { method: "POST" });
        const data = await res.json();
        if (!cancelled && res.ok) onStateRef.current(data.propertyFinderState ?? null);
      } catch {
        // Non-critical - try again on the next tick.
      }
      if (!cancelled && attempts < 40) timer = setTimeout(tick, attempts < 15 ? 8000 : 30000);
    };

    timer = setTimeout(tick, 8000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [publishing, listingId]);
}
