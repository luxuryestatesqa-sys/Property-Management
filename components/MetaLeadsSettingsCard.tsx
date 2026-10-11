"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { timeAgo } from "@/lib/timeAgo";

interface MetaPageRow {
  id: string;
  pageId: string;
  name: string;
  enabled: boolean;
  lastLeadAt: string | null;
  lastError: string | null;
  businessId: string | null;
  businessName: string | null;
  disabledForms: string[];
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
interface FormRow {
  id: string;
  name: string;
  status: string | null;
  leads: number | null;
  createdAt: string | null;
  enabled: boolean;
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

function Switch({ on, onClick, disabled, label }: { on: boolean; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-emerald-500" : "bg-slate-300"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

// The lead forms of one Page, read from Facebook when the Page is opened.
function FormsPanel({ page, busy, run }: { page: MetaPageRow; busy: string | null; run: (key: string, fn: () => Promise<Response>, ok: (d: Record<string, unknown>) => string, then?: () => void) => void }) {
  const [forms, setForms] = useState<FormRow[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [hideArchived, setHideArchived] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const res = await fetch(`/api/meta/pages/${page.id}/forms`);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setError(d?.error ?? "Couldn't load the forms");
    setForms(d.forms);
  }, [page.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="px-4 pb-4 text-[13px] text-danger">{error}</p>;
  if (!forms) return <p className="px-4 pb-4 text-[13px] text-muted">Loading forms…</p>;
  if (forms.length === 0) return <p className="px-4 pb-4 text-[13px] text-muted">This page has no lead forms yet. Create one in Meta Ads Manager (Instant forms) and it will show up here.</p>;

  const shown = forms.filter((f) => (!hideArchived || f.status !== "ARCHIVED") && f.name.toLowerCase().includes(q.trim().toLowerCase()));
  const importing = forms.filter((f) => f.enabled).length;
  const setMany = (enabled: boolean) => {
    const ids = shown.filter((f) => f.enabled !== enabled).map((f) => f.id);
    if (ids.length === 0) return;
    run(
      `${page.id}:formsbulk`,
      () => fetch(`/api/meta/pages/${page.id}/forms`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formIds: ids, enabled }) }),
      () => (enabled ? `${ids.length} form${ids.length === 1 ? "" : "s"} will import leads.` : `${ids.length} form${ids.length === 1 ? "" : "s"} switched off.`),
      () => setForms((prev) => prev && prev.map((x) => (ids.includes(x.id) ? { ...x, enabled } : x)))
    );
  };
  const hasArchived = forms.some((f) => f.status === "ARCHIVED");

  return (
    <div className="mx-4 mb-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[12.5px] font-medium text-slate-600">
          {importing} of {forms.length} form{forms.length === 1 ? "" : "s"} importing
        </span>
        <div className="flex gap-1.5">
          <button type="button" disabled={busy !== null || shown.every((f) => f.enabled)} onClick={() => setMany(true)} className="rounded-lg bg-white px-2.5 py-1 text-[12px] font-medium shadow-sm ring-1 ring-border hover:bg-surface-muted disabled:opacity-50">
            Select all
          </button>
          <button type="button" disabled={busy !== null || shown.every((f) => !f.enabled)} onClick={() => setMany(false)} className="rounded-lg bg-white px-2.5 py-1 text-[12px] font-medium shadow-sm ring-1 ring-border hover:bg-surface-muted disabled:opacity-50">
            Deselect all
          </button>
        </div>
        {forms.length > 5 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search forms" className="ml-auto w-44 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] outline-none focus:border-primary" />}
        {hasArchived && (
          <label className={`flex cursor-pointer items-center gap-1.5 text-[12.5px] text-slate-600 ${forms.length > 5 ? "" : "ml-auto"}`}>
            <input type="checkbox" checked={hideArchived} onChange={(e) => setHideArchived(e.target.checked)} />
            Hide archived
          </label>
        )}
      </div>
      {(q.trim() || hideArchived) && shown.length !== forms.length && <p className="mb-2 text-[12px] text-muted">Select all and Deselect all apply to the {shown.length} form{shown.length === 1 ? "" : "s"} shown.</p>}
      {shown.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-[13px] text-muted">No forms match.</p>}
    <ul className="divide-y divide-border rounded-xl border border-border bg-slate-50/60">
      {shown.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3">
          <Switch
            on={f.enabled}
            disabled={busy !== null}
            label={`${f.enabled ? "Stop importing" : "Import"} ${f.name}`}
            onClick={() =>
              run(
                `${page.id}:form:${f.id}`,
                () => fetch(`/api/meta/pages/${page.id}/forms`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formId: f.id, enabled: !f.enabled }) }),
                () => (f.enabled ? `“${f.name}” will no longer import leads.` : `“${f.name}” will import leads.`),
                () => setForms((prev) => prev && prev.map((x) => (x.id === f.id ? { ...x, enabled: !x.enabled } : x)))
              )
            }
          />
          <div className="min-w-0 flex-1">
            <div className={`truncate text-[13.5px] font-medium ${f.enabled ? "" : "text-muted line-through"}`}>{f.name}</div>
            <div className="text-[12px] text-muted">
              {f.status === "ARCHIVED" ? "Archived" : f.status === "ACTIVE" || !f.status ? "Active" : f.status.toLowerCase()}
              {f.leads !== null ? ` · ${f.leads} lead${f.leads === 1 ? "" : "s"} so far` : ""}
            </div>
          </div>
          <button
            type="button"
            disabled={busy !== null || !f.enabled}
            onClick={() => run(`${page.id}:fsync:${f.id}`, () => fetch(`/api/meta/pages/${page.id}/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formId: f.id }) }), (d) => `“${f.name}”: checked ${d.fetched ?? 0}, ${d.created ?? 0} new.`)}
            className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-medium shadow-sm ring-1 ring-border hover:bg-surface-muted disabled:opacity-50"
          >
            {busy === `${page.id}:fsync:${f.id}` ? "Fetching…" : "Fetch leads"}
          </button>
        </li>
      ))}
    </ul>
    </div>
  );
}

// Lets an agency's admin connect its Facebook Pages so Facebook and Instagram lead-form leads arrive
// in the Leads list on their own: Business portfolio > Page > lead form.
export default function MetaLeadsSettingsCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [open, setOpen] = useState<string | null>(null); // the Page whose forms are showing

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

  async function run(key: string, fn: () => Promise<Response>, ok: (d: Record<string, unknown>) => string, then?: () => void) {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fn();
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? { ok: true, text: ok(d) } : { ok: false, text: d?.error ?? "That didn't work" });
      if (res.ok) then?.();
      await load();
    } finally {
      setBusy(null);
    }
  }
  const json = { "Content-Type": "application/json" };
  const toggle = (p: MetaPageRow, enabled = !p.enabled) => run(`${p.id}:toggle`, () => fetch(`/api/meta/pages/${p.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ enabled }) }), () => (enabled ? `${p.name} is on. New leads will arrive automatically.` : `${p.name} switched off.`));

  const pages = useMemo(() => status?.pages ?? [], [status]);
  const connected = pages.length > 0;
  // Business portfolios first (largest first), then Pages with no portfolio.
  const groups = useMemo(() => {
    const byBiz = new Map<string, { id: string | null; name: string; pages: MetaPageRow[] }>();
    for (const p of pages) {
      const key = p.businessId ?? "none";
      if (!byBiz.has(key)) byBiz.set(key, { id: p.businessId, name: p.businessName ?? "", pages: [] });
      byBiz.get(key)!.pages.push(p);
    }
    return [...byBiz.values()].sort((a, b) => (a.id === null ? 1 : 0) - (b.id === null ? 1 : 0) || b.pages.length - a.pages.length);
  }, [pages]);
  const anyBusiness = groups.some((g) => g.id !== null);

  const pageRow = (p: MetaPageRow) => {
    const isOpen = open === p.id;
    return (
      <li key={p.id}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
          <Switch on={p.enabled} disabled={busy !== null} label={`${p.enabled ? "Turn off" : "Turn on"} ${p.name}`} onClick={() => toggle(p)} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] font-medium">{p.name}</div>
            <div className="text-[12.5px] text-muted">{p.enabled ? (p.lastLeadAt ? `Last lead ${timeAgo(p.lastLeadAt)}` : "On · waiting for the first lead") : "Off"}</div>
            {p.lastError && <div className="mt-1 text-[12.5px] text-danger">{p.lastError}</div>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-muted px-3 py-1.5 text-[12.5px] font-medium hover:bg-border">
              Lead forms
              <svg className={`transition-transform ${isOpen ? "rotate-180" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <button type="button" disabled={busy !== null} onClick={() => run(`${p.id}:sync`, () => fetch(`/api/meta/pages/${p.id}/sync`, { method: "POST" }), (d) => `Checked ${d.fetched ?? 0} lead${d.fetched === 1 ? "" : "s"} on ${p.name}: ${d.created ?? 0} new.`)} className="rounded-lg bg-surface-muted px-3 py-1.5 text-[12.5px] font-medium hover:bg-border disabled:opacity-60">
              {busy === `${p.id}:sync` ? "Fetching…" : "Fetch all"}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => confirm(`Remove ${p.name}? It will stop sending leads. Leads already received stay.`) && run(`${p.id}:remove`, () => fetch(`/api/meta/pages/${p.id}`, { method: "DELETE" }), () => `${p.name} removed.`)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-danger hover:bg-danger-bg disabled:opacity-60">
              Remove
            </button>
          </div>
        </div>
        {isOpen && <FormsPanel page={p} busy={busy} run={run} />}
      </li>
    );
  };

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
            The person who runs this software needs to create a Meta app and add its details to the server ({(status.missing ?? []).join(", ")}). Open &ldquo;Setup details&rdquo; below for the addresses Meta asks for.
          </p>
        </div>
      )}

      {status?.configured && !connected && !msg && <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3.5 text-[13.5px] text-slate-600">No pages connected yet. Press &ldquo;Connect Facebook&rdquo;, choose your Business portfolio and the Pages that run your lead ads.</p>}

      {connected && (
        <div className="mt-5 flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.id ?? "none"}>
              {(anyBusiness || g.id !== null) && (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-light text-primary">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 21V8l9-5 9 5v13M9 21v-6h6v6" />
                      </svg>
                    </span>
                    <div>
                      <div className="text-[13.5px] font-medium">{g.id ? g.name : "Pages without a business portfolio"}</div>
                      <div className="text-[11.5px] text-muted">{g.id ? "Business portfolio" : "Personal pages or pages Facebook didn't link to a business"} · {g.pages.length} page{g.pages.length === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                  {g.pages.length > 1 && (
                    <div className="flex gap-1.5">
                      <button type="button" disabled={busy !== null} onClick={() => run(`bulk:${g.id}:on`, async () => { for (const p of g.pages.filter((x) => !x.enabled)) { const r = await fetch(`/api/meta/pages/${p.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ enabled: true }) }); if (!r.ok) return r; } return new Response("{}") }, () => "All pages in this portfolio are on.")} className="rounded-lg bg-surface-muted px-2.5 py-1 text-[12px] font-medium hover:bg-border disabled:opacity-60">
                        Turn all on
                      </button>
                      <button type="button" disabled={busy !== null} onClick={() => run(`bulk:${g.id}:off`, async () => { for (const p of g.pages.filter((x) => x.enabled)) { const r = await fetch(`/api/meta/pages/${p.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ enabled: false }) }); if (!r.ok) return r; } return new Response("{}") }, () => "All pages in this portfolio are off.")} className="rounded-lg bg-surface-muted px-2.5 py-1 text-[12px] font-medium hover:bg-border disabled:opacity-60">
                        Turn all off
                      </button>
                    </div>
                  )}
                </div>
              )}
              <ul className="divide-y divide-border rounded-xl border border-border">{g.pages.map(pageRow)}</ul>
            </div>
          ))}
          {!anyBusiness && (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-[12.5px] leading-relaxed text-slate-600">
              Want your pages grouped by Business portfolio? Add the <b className="font-medium">business_management</b> permission to your Facebook Login configuration, then press &ldquo;Connect more pages&rdquo; again.
            </p>
          )}
        </div>
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
              Webhook field to subscribe to: <b className="font-medium">leadgen</b> · Permissions requested: {status.scopes.join(", ")} (add <b className="font-medium">business_management</b> to group pages by business portfolio) · Graph API {status.graphVersion}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
