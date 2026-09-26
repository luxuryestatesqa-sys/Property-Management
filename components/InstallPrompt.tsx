"use client";

import { useEffect, useState } from "react";

// Chrome/Edge/Android fire this instead of showing their own install UI
// automatically, once the manifest + HTTPS installability criteria are met -
// capturing it lets us offer our own "Install" button instead of leaving
// installability undiscoverable behind a browser menu.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "installPromptDismissedAt";
const DISMISS_DAYS = 14;

function isStandalone(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function wasRecentlyDismissed(): boolean {
  try {
    const at = localStorage.getItem(DISMISS_KEY);
    return at !== null && Date.now() - Number(at) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function InstallPrompt({ bottomClassName = "bottom-20" }: { bottomClassName?: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => typeof window !== "undefined" && (isStandalone() || wasRecentlyDismissed()));
  // iOS Safari never fires beforeinstallprompt - there's no programmatic
  // install API there, only the manual Share -> Add to Home Screen path, so
  // the best we can do is point agents to it. A plain UA check, so this can
  // be computed once up front instead of inside an effect.
  const [showIOSHint] = useState(() => typeof window !== "undefined" && isIOS());

  useEffect(() => {
    if (dismissed) return;

    function handleBeforeInstallPrompt(e: Event) {
      // Suppress Chrome's own mini-infobar so our banner is the one thing
      // offering the install action, not a competing browser UI.
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, [dismissed]);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private browsing / blocked storage - worst case this reappears next visit.
    }
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }

  if (dismissed || (!deferredPrompt && !showIOSHint)) return null;

  return (
    <div
      className={`fixed ${bottomClassName} left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-surface shadow-lg p-3.5 flex items-center gap-3 safe-bottom`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="w-10 h-10 rounded-xl shrink-0" style={{ background: "var(--primary)" }} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[14px]">Install Luxury Estates</div>
        <div className="text-[12px] text-muted truncate">
          {deferredPrompt ? "Add to your home screen for quick, full-screen access." : 'Tap Share, then "Add to Home Screen"'}
        </div>
      </div>
      {deferredPrompt && (
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-lg px-3 py-2 text-[13px] font-semibold text-white active:opacity-80"
          style={{ background: "var(--primary)" }}
        >
          Install
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-muted text-lg px-1 active:opacity-70">
        ✕
      </button>
    </div>
  );
}
