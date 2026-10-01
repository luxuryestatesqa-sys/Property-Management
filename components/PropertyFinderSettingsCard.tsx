"use client";

import { useEffect, useState } from "react";
import { extractErrorMessage } from "@/lib/errors";

interface PFStatus {
  configured: boolean;
  apiKeyPreview: string | null;
  apiSecretPreview: string | null;
  webhookSecretConfigured: boolean;
  updatedAt: string | null;
}

interface WebhookStatus {
  missing: string[];
  subscribed: string[];
}

// The generic credential-storage route this card talks to for reading/saving
// keys (/api/admin/portals/[portal]) already works for any Portal enum
// value - a second portal's settings card reuses it as-is, pointing at its
// own enum value, and only needs its own "test connection" + webhook logic
// (both genuinely portal-specific) written fresh.
const PORTAL = "PROPERTY_FINDER";

// The one place an admin manages Property Finder's API credentials and
// webhook subscription - previously this required editing server env vars
// directly.
export default function PropertyFinderSettingsCard() {
  const [status, setStatus] = useState<PFStatus | null>(null);
  const [loadError, setLoadError] = useState("");

  const [editing, setEditing] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiSecretInput, setApiSecretInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null);
  const [webhookError, setWebhookError] = useState("");
  const [webhookBusy, setWebhookBusy] = useState(false);

  async function loadStatus() {
    try {
      const res = await fetch(`/api/admin/portals/${PORTAL}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data) setStatus(data);
      else setLoadError(extractErrorMessage(data?.error, "Failed to load status"));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Network error. Please try again.");
    }
  }

  async function loadWebhookStatus() {
    try {
      const res = await fetch("/api/portals/propertyfinder/webhooks");
      const data = await res.json().catch(() => null);
      if (res.ok && data) setWebhookStatus(data);
      else setWebhookError(extractErrorMessage(data?.error, "Failed to check webhook status"));
    } catch (err) {
      setWebhookError(err instanceof Error ? err.message : "Network error. Please try again.");
    }
  }

  useEffect(() => {
    loadStatus();
    loadWebhookStatus();
  }, []);

  async function saveCredentials(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    const body: Record<string, string> = {};
    if (apiKeyInput.trim()) body.apiKey = apiKeyInput.trim();
    if (apiSecretInput.trim()) body.apiSecret = apiSecretInput.trim();
    if (Object.keys(body).length === 0) {
      setSaveError("Enter an API key and/or secret");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/portals/${PORTAL}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(extractErrorMessage(data?.error, "Failed to save"));
        return;
      }
      setApiKeyInput("");
      setApiSecretInput("");
      setEditing(false);
      setTestResult(null);
      await loadStatus();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/portals/propertyfinder/test", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setTestResult({ ok: true, message: `Connected — ${data.balance.remaining} of ${data.balance.total} credits remaining` });
      } else {
        setTestResult({ ok: false, message: extractErrorMessage(data?.error, "Connection failed") });
      }
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Network error. Please try again." });
    } finally {
      setTesting(false);
    }
  }

  async function setupWebhooks() {
    setWebhookBusy(true);
    setWebhookError("");
    try {
      const res = await fetch("/api/portals/propertyfinder/webhooks", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setWebhookError(extractErrorMessage(data?.error, "Failed to set up webhooks"));
        return;
      }
      await loadWebhookStatus();
    } catch (err) {
      setWebhookError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setWebhookBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.07 0l1.93-1.93a5 5 0 0 0-7.07-7.07L10.5 5.5" />
            <path d="M14 11a5 5 0 0 0-7.07 0l-1.93 1.93a5 5 0 0 0 7.07 7.07L13.5 18.5" />
          </svg>
          <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide">Property Finder</h3>
        </div>
        {status && (
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={status.configured ? { background: "var(--success-bg)", color: "var(--success)" } : { background: "var(--surface-muted)", color: "var(--muted)" }}
          >
            {status.configured ? "Configured" : "Not Configured"}
          </span>
        )}
      </div>

      {loadError && <p className="text-[13px] text-danger mt-2">{loadError}</p>}

      {!status && !loadError && (
        <div className="flex flex-col gap-2 mt-3">
          <div className="h-11 rounded-xl bg-surface-muted animate-pulse" />
          <div className="h-11 rounded-xl bg-surface-muted animate-pulse" />
        </div>
      )}

      {status && !editing && (
        <div className="flex flex-col gap-2.5 mt-3 text-[14px]">
          <div className="flex justify-between items-center">
            <span className="text-muted">API Key</span>
            <span className="font-medium font-mono">{status.apiKeyPreview ?? "Not set"}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted">API Secret</span>
            <span className="font-medium font-mono">{status.apiSecretPreview ?? "Not set"}</span>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="self-start text-[12px] font-semibold px-3 py-2 rounded-lg text-white active:opacity-80 mt-1"
            style={{ background: "var(--primary)" }}
          >
            {status.configured ? "Update Credentials" : "Add Credentials"}
          </button>
        </div>
      )}

      {status && editing && (
        <form onSubmit={saveCredentials} className="flex flex-col gap-3 mt-3 border-t border-border pt-3">
          <div>
            <label className="text-sm font-medium block mb-1.5">API Key</label>
            <input
              type="text"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={status.apiKeyPreview ? `Leave blank to keep ${status.apiKeyPreview}` : "Paste API key"}
              className="w-full rounded-xl border border-border px-4 py-3 text-base outline-none focus:border-primary font-mono"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">API Secret</label>
            <input
              type="text"
              value={apiSecretInput}
              onChange={(e) => setApiSecretInput(e.target.value)}
              placeholder={status.apiSecretPreview ? `Leave blank to keep ${status.apiSecretPreview}` : "Paste API secret"}
              className="w-full rounded-xl border border-border px-4 py-3 text-base outline-none focus:border-primary font-mono"
            />
          </div>
          <p className="text-[12px] text-muted -mt-1">From PF Expert → Developer Resources → API Credentials (type &quot;API Integration&quot;).</p>
          {saveError && <div className="rounded-xl bg-danger-bg text-danger text-sm px-4 py-3">{saveError}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setApiKeyInput("");
                setApiSecretInput("");
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

      {status?.configured && (
        <div className="mt-3 pt-3 border-t border-border">
          <button
            type="button"
            onClick={testConnection}
            disabled={testing}
            className="text-[12px] font-semibold px-3 py-2 rounded-lg bg-surface-muted active:opacity-70 disabled:opacity-60"
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
          {testResult && (
            <p className="text-[12px] mt-2" style={{ color: testResult.ok ? "var(--success)" : "var(--danger)" }}>
              {testResult.message}
            </p>
          )}
        </div>
      )}

      {status?.configured && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted">Webhooks</span>
            {webhookStatus && (
              <span className="text-[11px] font-semibold" style={{ color: webhookStatus.missing.length === 0 ? "var(--success)" : "var(--muted)" }}>
                {webhookStatus.missing.length === 0 ? "All set up" : `${webhookStatus.subscribed.length}/${webhookStatus.subscribed.length + webhookStatus.missing.length} subscribed`}
              </span>
            )}
          </div>
          {webhookError && <p className="text-[12px] text-danger mt-1.5">{webhookError}</p>}
          {webhookStatus && webhookStatus.missing.length > 0 && (
            <button
              type="button"
              onClick={setupWebhooks}
              disabled={webhookBusy}
              className="mt-2 text-[12px] font-semibold px-3 py-2 rounded-lg bg-surface-muted active:opacity-70 disabled:opacity-60"
            >
              {webhookBusy ? "Setting up..." : "Set up webhooks"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
