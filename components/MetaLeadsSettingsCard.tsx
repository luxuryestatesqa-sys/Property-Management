"use client";

import { useCallback, useEffect, useState } from "react";
import { timeAgo } from "@/lib/timeAgo";

interface MetaPageRow {
  id: string;
  pageId: string;
  name: string;
  enabled: boolean;
  lastLeadAt: string | null;
  lastError: string | null;
}
interface Status {
  configured: boolean;
  missing: string[];
  graphVersion: string;
  scopes: string[];
  webhookUrl: string;
  callbackUrl: string;
  deauthorizeUrl: string;
  dataDeletionUrl: string;
  baseNote: string | null;
  pages: MetaPageRow[];
}

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Facebook connected. Turn on the pages whose leads you want here." },
  denied: { ok: false, text: "Facebook wasn't connected: the permissions weren't allowed." },
  bad_state: { ok: false, text: "That connection attempt expired. Please try again." },
  failed: { ok: false, text: "Facebook couldn't be connected. Please try again." },
  not_configured: { ok: false, text: "Facebook isn't set up on the server yet." },
};

function Copy({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      <div className="mb-1 text-[12px] font-medium text-muted">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-muted px-3 py-2 text-[12.5px]">{value}</code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(value).then(() => {
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            });
          }}
          className="shrink-0 rounded-lg bg-surface-muted px-3 py-2 text-[12.5px] font-medium hover:bg-border"
        >
          {done ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

// Lets an agency's admin connect its Facebook Pages so Facebook and Instagram lead-form leads arrive
// in the Leads list on their own.
export default function MetaLeadsSettingsCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/meta/status");
    if (!res.ok) return setLoadError("Couldn't load the Facebook connection.");
    setStatus(await res.json());
  }, []);

  useEffect(() => {
    load();
    // Coming back from Facebook: show how it went, then tidy the address.
    const sp = new URLSearchParams(window.location.search);
    const m = sp.get("meta");
    if (m) {
      const base = MESSAGES[m] ?? { ok: false, text: "Something went wrong." };
      const pages = sp.get("pages");
      const taken = Number(sp.get("taken") ?? 0);
      setMsg({
        ok: base.ok,
        text: m === "connected" ? `${pages ?? 0} page${pages === "1" ? "" : "s"} found. ${base.text}${taken ? ` ${taken} other page${taken === 1 ? " is" : "s are"} already connected to another agency.` : ""}` : m === "failed" && sp.get("reason") ? `${base.text} (${sp.get("reason")})` : base.text,
      });
      const clean = new URL(window.location.href);
      ["meta", "pages", "taken", "reason"].forEach((k) => clean.searchParams.delete(k));
      window.history.replaceState({}, "", clean.toString());
    }
  }, [load]);

  async function act(id: string, key: string, run: () => Promise<Response>, ok: (d: Record<string, unknown>) => string) {
    setBusy(`${id}:${key}`);
    setMsg(null);
    try {
      const res = await run();
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? { ok: true, text: ok(d) } : { ok: false, text: d?.error ?? "That didn't work" });
      await load();
    } finally {
      setBusy(null);
    }
  }
  const json = { "Content-Type": "application/json" };

  const connected = (status?.pages.length ?? 0) > 0;

  return (
    <section className="surface-card p-6 lg:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[16px] font-medium">Facebook &amp; Instagram lead ads</h3>
          <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-muted">
            Connect your Facebook Pages. When someone fills in a lead form on a Facebook or Instagram ad, the lead appears in Leads within seconds and is given out by your assignment rules.
          </p>
        </div>
        {status?.configured && (
          <a href="/api/meta/connect" className="inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-medium text-white shadow-sm" style={{ background: "#1877f2" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0 0 22 12Z" />
            </svg>
            {connected ? "Connect more pages" : "Connect Facebook"}
          </a>
        )}
      </div>

      {msg && <div className={`mt-4 rounded-xl px-4 py-3 text-[13.5px] ${msg.ok ? "bg-success-bg" : "bg-danger-bg text-danger"}`} style={msg.ok ? { color: "var(--success)" } : undefined}>{msg.text}</div>}
      {loadError && <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-[13.5px] text-danger">{loadError}</div>}

      {status && !status.configured && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-[13.5px] leading-relaxed text-amber-900">
          <div className="font-medium">Facebook isn&apos;t set up on the server yet</div>
          <p className="mt-1">
            The person who runs this software needs to create a Meta app and add its details to the server ({status.missing.join(", ")}). Open &ldquo;Setup details&rdquo; below for the addresses Meta asks for.
          </p>
        </div>
      )}

      {status?.configured && !connected && !msg && <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3.5 text-[13.5px] text-slate-600">No pages connected yet. Press &ldquo;Connect Facebook&rdquo; and choose the Pages that run your lead ads.</p>}

      {connected && (
        <ul className="mt-5 divide-y divide-border rounded-xl border border-border">
          {status!.pages.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
              <button
                type="button"
                role="switch"
                aria-checked={p.enabled}
                aria-label={`${p.enabled ? "Turn off" : "Turn on"} ${p.name}`}
                disabled={busy !== null}
                onClick={() => act(p.id, "toggle", () => fetch(`/api/meta/pages/${p.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ enabled: !p.enabled }) }), () => (p.enabled ? `${p.name} switched off.` : `${p.name} is on. New leads will arrive automatically.`))}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${p.enabled ? "bg-emerald-500" : "bg-slate-300"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${p.enabled ? "left-[22px]" : "left-0.5"}`} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-medium">{p.name}</div>
                <div className="text-[12.5px] text-muted">{p.enabled ? (p.lastLeadAt ? `Last lead ${timeAgo(p.lastLeadAt)}` : "On · waiting for the first lead") : "Off"}</div>
                {p.lastError && <div className="mt-1 text-[12.5px] text-danger">{p.lastError}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => act(p.id, "sync", () => fetch(`/api/meta/pages/${p.id}/sync`, { method: "POST" }), (d) => `Checked ${d.fetched ?? 0} lead${d.fetched === 1 ? "" : "s"} on ${p.name}: ${d.created ?? 0} new.`)}
                  className="rounded-lg bg-surface-muted px-3 py-1.5 text-[12.5px] font-medium hover:bg-border disabled:opacity-60"
                >
                  {busy === `${p.id}:sync` ? "Fetching…" : "Fetch leads"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => confirm(`Remove ${p.name}? It will stop sending leads. Leads already received stay.`) && act(p.id, "remove", () => fetch(`/api/meta/pages/${p.id}`, { method: "DELETE" }), () => `${p.name} removed.`)}
                  className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-danger hover:bg-danger-bg disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5">
        <button type="button" onClick={() => setShowSetup((v) => !v)} className="text-[13px] font-medium" style={{ color: "var(--primary)" }}>
          {showSetup ? "Hide setup details" : "Setup details"}
        </button>
        {showSetup && status && (
          <div className="mt-3 flex flex-col gap-3 rounded-xl bg-slate-50 p-4">
            <p className="text-[12.5px] leading-relaxed text-slate-600">For the person who set up the Meta app. These are the addresses Meta asks for in your app&apos;s settings (Facebook Login, Webhooks and Basic settings).</p>
            {status.baseNote && <p className="rounded-lg bg-amber-100 px-3 py-2 text-[12.5px] text-amber-900">{status.baseNote}</p>}
            <Copy label="Webhook callback URL (Webhooks → Page)" value={status.webhookUrl} />
            <Copy label="Valid OAuth redirect URI (Facebook Login → Settings)" value={status.callbackUrl} />
            <Copy label="Deauthorize callback URL" value={status.deauthorizeUrl} />
            <Copy label="Data deletion request URL" value={status.dataDeletionUrl} />
            <div className="text-[12.5px] text-slate-600">
              Webhook field to subscribe to: <b className="font-medium">leadgen</b> · Permissions requested: {status.scopes.join(", ")} · Graph API {status.graphVersion}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
