"use client";

import { useEffect, useSyncExternalStore } from "react";

// The number on the Leads nav item (new leads + overdue follow-ups). One shared store for the sidebar and
// the bottom nav: a single request per refresh, and the last known value stays on screen while the next
// one loads, so the badge never disappears as you move between pages.
let value = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

try {
  value = Number(sessionStorage.getItem("leadBadge") ?? 0) || 0;
} catch {}

const emit = () => listeners.forEach((l) => l());

// Callers that ask while a request is on its way (sidebar + bottom nav, rapid navigation) share it, and a
// result younger than a few seconds is reused instead of asking the server again.
let inflight: Promise<void> | null = null;
let lastFetched = 0;
const FRESH_MS = 5_000;

export function refreshLeadBadge(): Promise<void> {
  if (inflight) return inflight;
  if (Date.now() - lastFetched < FRESH_MS) return Promise.resolve();
  inflight = (async () => {
    try {
      const r = await fetch("/api/leads/summary");
      if (!r.ok) return;
      const d = await r.json();
      lastFetched = Date.now();
      const next = (d.newCount ?? 0) + (d.overdueCount ?? 0);
      if (next !== value) {
        value = next;
        try {
          sessionStorage.setItem("leadBadge", String(next));
        } catch {}
        emit();
      }
    } catch {
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) timer = setInterval(refreshLeadBadge, 60_000);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useLeadBadge(signedIn: boolean, pathname: string): number {
  const v = useSyncExternalStore(subscribe, () => value, () => 0);
  useEffect(() => {
    if (signedIn) refreshLeadBadge();
  }, [signedIn, pathname]);
  return signedIn ? v : 0;
}
