import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 768px)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

// True from tablet width up (Tailwind's `lg`, set to 768px in globals.css). Lets a page render a
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

const noop = () => () => {};

// False while the page is being server-rendered and hydrated, true from the first client render after.
// A page that shows a different tree on phone and desktop can render one neutral placeholder until
// this is true, so the wrong layout never flashes (and then remounts, scrolling back to the top).
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
