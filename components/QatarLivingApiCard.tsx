"use client";

import { useEffect, useState } from "react";
import { extractErrorMessage } from "@/lib/errors";

interface FeedStatus {
  feedToken: string | null;
}

// Qatar Living's real feed API (app/api/qatar-living/listings) authenticates
// with a static X-API-Key header, not the ?agency=&token= query string the
// other pull feeds use (components/PortalFeedCard.tsx) - this card shows the
// endpoint URL and the key value to hand to Qatar Living separately, rather
// than one combined copyable link.
export default function QatarLivingApiCard() {
  const [status, setStatus] = useState<FeedStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState<"url" | "key" | null>(null);

  async function loadStatus() {
    try {
      const res = await fetch(`/api/admin/portals/QATAR_LIVING`);
      const data = await res.json();
      if (res.ok) setStatus(data);
      else setLoadError(extractErrorMessage(data.error, "Failed to load status"));
    } catch {
      setLoadError("Network error. Please try again.");
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  const endpointUrl = typeof window !== "undefined" ? `${window.location.origin}/api/qatar-living/listings` : null;

  async function regenerateToken() {
    if (status?.feedToken && !window.confirm("Regenerate the Qatar Living API key? The current key will stop working immediately - update it with Qatar Living wherever it's registered.")) {
      return;
    }
    setRegenerating(true);
    try {
      const res = await fetch(`/api/admin/portals/QATAR_LIVING/feed-token`, { method: "POST" });
      if (res.ok) await loadStatus();
    } finally {
      setRegenerating(false);
    }
  }

  async function copy(text: string, which: "url" | "key") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard access can be denied - not worth surfacing an error for a copy button.
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide">Qatar Living Feed API</h3>
        {status && (
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={status.feedToken ? { background: "var(--success-bg)", color: "var(--success)" } : { background: "var(--surface-muted)", color: "var(--muted)" }}
          >
            {status.feedToken ? "Active" : "Not Set Up"}
          </span>
        )}
      </div>

      {loadError && <p className="text-[13px] text-danger mt-2">{loadError}</p>}

      {!status && !loadError && <div className="h-11 rounded-xl bg-surface-muted animate-pulse mt-3" />}

      {status && (
        <div className="flex flex-col gap-2.5 mt-3 text-[14px]">
          <p className="text-[12px] text-muted">
            Give Qatar Living this endpoint URL and API key - they poll it with <code>X-API-Key: &lt;key&gt;</code> per their feed spec.
          </p>

          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-muted">Endpoint URL</span>
              {endpointUrl && (
                <button type="button" onClick={() => copy(endpointUrl, "url")} className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-surface-muted text-muted active:opacity-70">
                  {copied === "url" ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            <p className="text-[12px] font-mono break-all rounded-xl bg-surface-muted px-3 py-2">{endpointUrl ?? "/api/qatar-living/listings"}</p>
          </div>

          {status.feedToken ? (
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-muted">API Key</span>
                <button type="button" onClick={() => copy(status.feedToken!, "key")} className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-surface-muted text-muted active:opacity-70">
                  {copied === "key" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-[12px] font-mono break-all rounded-xl bg-surface-muted px-3 py-2">{status.feedToken}</p>
            </div>
          ) : (
            <p className="text-[12px] text-muted">Generate an API key to give Qatar Living access.</p>
          )}

          <button
            type="button"
            onClick={regenerateToken}
            disabled={regenerating}
            className="self-start text-[12px] font-semibold px-3 py-2 rounded-lg bg-surface-muted active:opacity-70 disabled:opacity-60 mt-1"
          >
            {regenerating ? "Regenerating..." : status.feedToken ? "Regenerate Key" : "Generate Key"}
          </button>
        </div>
      )}
    </section>
  );
}
