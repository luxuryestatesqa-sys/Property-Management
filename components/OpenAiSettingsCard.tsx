"use client";

import { useEffect, useState } from "react";
import { extractErrorMessage } from "@/lib/errors";

interface Status {
  apiKeyPreview: string | null;
}

// Admin-only: where the OpenAI API key behind "Generate with AI" is entered.
// Uses the same generic credential route as the portal cards
// (/api/admin/portals/[portal]); the key is stored server-side and only a
// masked preview ever comes back to the browser.
export default function OpenAiSettingsCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function loadStatus() {
    try {
      const res = await fetch("/api/admin/portals/OPENAI");
      const data = await res.json().catch(() => null);
      if (res.ok && data) setStatus({ apiKeyPreview: data.apiKeyPreview });
      else setLoadError(extractErrorMessage(data?.error, "Failed to load status"));
    } catch {
      setLoadError("Network error. Please try again.");
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    if (!keyInput.trim()) {
      setSaveError("Paste your OpenAI API key");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/portals/OPENAI", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: keyInput.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(extractErrorMessage(data?.error, "Failed to save"));
        return;
      }
      setKeyInput("");
      setEditing(false);
      setTestResult(null);
      await loadStatus();
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function testKey() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/ai/test", { method: "POST" });
      const data = await res.json().catch(() => null);
      setTestResult(res.ok && data?.ok ? { ok: true, message: "Key works - Generate with AI is ready" } : { ok: false, message: extractErrorMessage(data?.error, "Key check failed") });
    } catch {
      setTestResult({ ok: false, message: "Network error. Please try again." });
    } finally {
      setTesting(false);
    }
  }

  const configured = Boolean(status?.apiKeyPreview);

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide">AI Writing (OpenAI)</h3>
        {status && (
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={configured ? { background: "var(--success-bg)", color: "var(--success)" } : { background: "var(--surface-muted)", color: "var(--muted)" }}
          >
            {configured ? "Connected" : "Not Set Up"}
          </span>
        )}
      </div>
      <p className="text-[12px] text-muted">Powers the &quot;Generate with AI&quot; button for listing titles and descriptions.</p>

      {loadError && <p className="text-[13px] text-danger mt-2">{loadError}</p>}
      {!status && !loadError && <div className="h-11 rounded-xl bg-surface-muted animate-pulse mt-3" />}

      {status && (
        <div className="flex flex-col gap-2.5 mt-3 text-[14px]">
          {!editing ? (
            <div className="flex justify-between items-center">
              <span className="text-muted">API Key</span>
              <div className="flex items-center gap-2">
                <span className="font-medium font-mono">{status.apiKeyPreview ?? "Not set"}</span>
                <button type="button" onClick={() => setEditing(true)} className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-surface-muted text-muted active:opacity-70">
                  {configured ? "Replace" : "Add"}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={save} className="flex flex-col gap-2">
              <input
                type="password"
                autoComplete="off"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="sk-..."
                className="w-full rounded-xl border border-border px-4 py-3 text-base outline-none focus:border-primary font-mono"
              />
              {saveError && <p className="text-[12px] text-danger">{saveError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setKeyInput("");
                    setSaveError("");
                  }}
                  className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold bg-surface-muted active:opacity-70"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold text-white active:opacity-80 disabled:opacity-60" style={{ background: "var(--primary)" }}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          )}

          {configured && !editing && (
            <button type="button" onClick={testKey} disabled={testing} className="self-start text-[12px] font-semibold px-3 py-2 rounded-lg bg-surface-muted active:opacity-70 disabled:opacity-60">
              {testing ? "Testing..." : "Test Key"}
            </button>
          )}
          {testResult && (
            <div className={`rounded-xl text-[13px] px-3 py-2 ${testResult.ok ? "bg-success-bg" : "bg-danger-bg"}`}>{testResult.message}</div>
          )}
        </div>
      )}
    </section>
  );
}
