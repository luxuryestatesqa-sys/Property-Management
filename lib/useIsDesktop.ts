import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

// True on laptop/desktop widths (Tailwind's `lg`). Lets a page render a
// different, desktop-only layout instead of stacking CSS overrides on the
// phone markup. Always false during server render, so phones never see the
// desktop tree.
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  );
}
