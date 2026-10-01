"use client";

import { useEffect, useState } from "react";
import { extractErrorMessage } from "@/lib/errors";

interface FeedStatus {
  feedAgencyId: string | null;
  feedToken: string | null;
}

interface PortalFeedCardProps {
  portal: "WEBSITE" | "PROPERTY_FINDER" | "PROPERTY_ORYX";
  slug: "website.json" | "pf.xml" | "oryx.xml";
  label: string;
}

// One card per feed's public link - agency id + token, both
// required by app/feeds/[portal] to authorize a request. Reuses the same
// generic /api/admin/portals/[portal] route the credentials card writes to
// (feedAgencyId is just another field on PortalCredential); the token itself
// is only ever set via the dedicated regenerate endpoint, never typed in.
export default function PortalFeedCard({ portal, slug, label }: PortalFeedCardProps) {
  const [status, setStatus] = useState<FeedStatus | null>(null);
  const [loadError, setLoadError] = useState("");

  const [editingAgency, setEditingAgency] = useState(false);
  const [agencyInput, setAgencyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  async function loadStatus() {
    try {
      const res = await fetch(`/api/admin/portals/${portal}`);
      const data = await res.json();
      if (res.ok) setStatus(data);
      else setLoadError(extractErrorMessage(data.error, "Failed to load status"));
    } catch {
      setLoadError("Network error. Please try again.");
    }
  }

  useEffect(() => {
    loadStatus();
  }, [portal]);

  const feedUrl =
    status?.feedAgencyId && status?.feedToken && typeof window !== "undefined"
      ? `${window.location.origin}/feeds/${slug}?agency=${encodeURIComponent(status.feedAgencyId)}&token=${status.feedToken}`
      : null;

  async function saveAgencyId(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    if (!agencyInput.trim()) {
      setSaveError("Enter an agency ID");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/portals/${portal}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedAgencyId: agencyInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(extractErrorMessage(data.error, "Failed to save"));
        return;
      }
      setAgencyInput("");
      setEditingAgency(false);
      await loadStatus();
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function regenerateToken() {
    if (status?.feedToken && !window.confirm(`Regenerate the ${label} feed token? The current feed link will stop working immediately - update it wherever it's registered.`)) {
      return;
    }
    setRegenerating(true);
    try {
      const res = await fetch(`/api/admin/portals/${portal}/feed-token`, { method: "POST" });
      if (res.ok) await loadStatus();
    } finally {
      setRegenerating(false);
    }
  }

  async function copyFeedUrl() {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied - not worth surfacing an error for a copy button.
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide">{label} Feed</h3>
        {status && (
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={feedUrl ? { background: "var(--success-bg)", color: "var(--success)" } : { background: "var(--surface-muted)", color: "var(--muted)" }}
          >
            {feedUrl ? "Active" : "Not Set Up"}
          </span>
        )}
      </div>

      {loadError && <p className="text-[13px] text-danger mt-2">{loadError}</p>}

      {!status && !loadError && <div className="h-11 rounded-xl bg-surface-muted animate-pulse mt-3" />}

      {status && (
        <div className="flex flex-col gap-2.5 mt-3 text-[14px]">
          {!editingAgency ? (
            <div className="flex justify-between items-center">
              <span className="text-muted">Agency ID</span>
              <div className="flex items-center gap-2">
                <span className="font-medium font-mono">{status.feedAgencyId ?? "Not set"}</span>
                <button type="button" onClick={() => setEditingAgency(true)} className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-surface-muted text-muted active:opacity-70">
                  Edit
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={saveAgencyId} className="flex flex-col gap-2">
              <input
                type="text"
                value={agencyInput}
                onChange={(e) => setAgencyInput(e.target.value)}
                placeholder={status.feedAgencyId ?? "e.g. LE001"}
                className="w-full rounded-xl border border-border px-4 py-3 text-base outline-none focus:border-primary font-mono"
              />
              {saveError && <p className="text-[12px] text-danger">{saveError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingAgency(false);
                    setAgencyInput("");
                    setSaveError("");
                  }}
                  className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold bg-surface-muted active:opacity-70"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold text-white active:opacity-80 disabled:opacity-60"
                  style={{ background: "var(--primary)" }}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          )}

          {feedUrl ? (
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-muted">Feed Link</span>
                <button type="button" onClick={copyFeedUrl} className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-surface-muted text-muted active:opacity-70">
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-[12px] font-mono break-all rounded-xl bg-surface-muted px-3 py-2">{feedUrl}</p>
            </div>
          ) : (
            <p className="text-[12px] text-muted">Set an agency ID and generate a token to get this portal&apos;s feed link.</p>
          )}

          <button
            type="button"
            onClick={regenerateToken}
            disabled={regenerating}
            className="self-start text-[12px] font-semibold px-3 py-2 rounded-lg bg-surface-muted active:opacity-70 disabled:opacity-60 mt-1"
          >
            {regenerating ? "Regenerating..." : status.feedToken ? "Regenerate Token" : "Generate Token"}
          </button>
        </div>
      )}
    </section>
  );
}
