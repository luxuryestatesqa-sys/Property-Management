"use client";

import { can } from "@/lib/permissions";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";
import { timeAgo } from "@/lib/timeAgo";
import { CHANNEL_LABELS } from "@/components/leads/leadTypes";
import { IconChevronLeft } from "@/components/desktop/icons";
import { FreshBadge, FRESH_STYLE } from "@/components/leads/LeadBits";
import { isFreshLead } from "@/components/leads/leadTypes";

interface Agent {
  id: string;
  name: string;
  avatarUrl: string | null;
  open: number;
  total: number;
  won: number;
  avgResponseMinutes: number | null;
}
interface Unassigned {
  id: string;
  name: string;
  phone: string | null;
  channel: keyof typeof CHANNEL_LABELS;
  region: string | null;
  listing: string | null;
  listingReference: string | null;
  receivedAt: string;
  firstContactedAt: string | null;
}
interface Data {
  unassigned: Unassigned[];
  workload: Agent[];
  audit: { id: string; text: string | null; createdAt: string; by: string | null; lead: { id: string; name: string } }[];
}

const card = "rounded-2xl border border-border bg-surface shadow-sm";
const PALETTE = ["#2b4fc0", "#06b6d4", "#16a34a", "#8b5cf6", "#f59e0b", "#ec4899", "#14b8a6", "#6366f1"];
const CHANNEL_STYLE: Record<string, { bg: string; fg: string }> = {
  WHATSAPP: { bg: "#dcfce7", fg: "#15803d" },
  CALL: { bg: "#cffafe", fg: "#0e7490" },
  EMAIL: { bg: "#e0e7ff", fg: "#4338ca" },
  FORM: { bg: "#fce7f3", fg: "#be185d" },
  OTHER: { bg: "#f1f5f9", fg: "#475569" },
};
const HOUR = 3600_000;
const digitsOf = (v: string) => v.replace(/\D/g, "");
const hasText = (v: string) => /[\p{L}\p{N}]/u.test(v);

// WhatsApp profile names arrive as they are: empty, "!", "...", an emoji, or the phone number itself.
function leadLabel(l: { name: string; phone: string | null; channel: string }) {
  const n = l.name.trim();
  if (!n || !hasText(n) || (l.phone && digitsOf(n) === digitsOf(l.phone) && digitsOf(n).length > 6)) return l.channel === "WHATSAPP" ? "Unknown (WhatsApp)" : "Unknown name";
  return n;
}
// A bare Property Finder reference code (long, upper case) is not a property name.
const isRawRef = (v: string | null) => Boolean(v && /^[A-Z0-9]{14,}$/.test(v));

export default function AssignmentPage() {
  const { data: session, status } = useSession();
  const isManager = can(session?.user, "leads.assign");
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [nowMs] = useState(() => Date.now());

  const load_ = useCallback(async () => {
    const res = await fetch("/api/leads/assignment");
    if (res.status === 403) return setDenied(true);
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    if (status === "authenticated") load_();
  }, [status, load_]);

  async function post(url: string, body: unknown, method = "POST") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg({ ok: false, text: d?.error ?? "That didn't work" });
        return null;
      }
      return d;
    } finally {
      setBusy(false);
    }
  }

  async function assign() {
    const d = await post("/api/leads/assignment", { action: "assign", leadIds: [...picked], agentId });
    if (d) {
      setMsg({ ok: true, text: `Assigned ${d.assigned} lead${d.assigned === 1 ? "" : "s"}.` });
      setPicked(new Set());
      await load_();
    }
  }
  // Spread the selected leads over the agents, always giving the next one to whoever has the fewest open leads.
  async function spreadEvenly() {
    const team = data?.workload ?? [];
    if (!team.length || picked.size === 0) return;
    const load = new Map(team.map((a) => [a.id, a.open]));
    const plan = new Map<string, string[]>();
    const people = new Map<string, string[]>();
    for (const l of data?.unassigned ?? []) {
      if (!picked.has(l.id)) continue;
      const key = l.phone && digitsOf(l.phone).length >= 7 ? digitsOf(l.phone) : l.id;
      people.set(key, [...(people.get(key) ?? []), l.id]);
    }
    for (const ids of people.values()) {
      const [next] = [...load.entries()].sort((x, y) => x[1] - y[1]);
      load.set(next[0], next[1] + ids.length);
      plan.set(next[0], [...(plan.get(next[0]) ?? []), ...ids]);
    }
    let done = 0;
    for (const [agent, ids] of plan) {
      const d = await post("/api/leads/assignment", { action: "assign", leadIds: ids, agentId: agent });
      if (!d) break;
      done += d.assigned ?? ids.length;
    }
    if (done) {
      setMsg({ ok: true, text: `Spread ${done} lead${done === 1 ? "" : "s"} across ${plan.size} agent${plan.size === 1 ? "" : "s"}.` });
      setPicked(new Set());
    }
    await load_();
  }
  if (status === "loading") return null;
  if (denied || (status === "authenticated" && !isManager))
    return (
      <div className="px-4 py-20 text-center text-muted">
        <p>Only managers and admins can assign leads.</p>
        <Link href="/leads" className="font-semibold" style={{ color: "var(--primary)" }}>
          Back to Leads
        </Link>
      </div>
    );

  const agents = data?.workload ?? [];
  const allPicked = data && data.unassigned.length > 0 && picked.size === data.unassigned.length;
  const maxOpen = Math.max(1, ...agents.map((a) => a.open));
  const leastBusy = agents.length > 1 ? [...agents].sort((x, y) => x.open - y.open)[0] : null;
  const colorOf = new Map(agents.map((a, i) => [a.id, PALETTE[i % PALETTE.length]]));
  const needle = q.trim().toLowerCase();
  // The same phone can enquire several times (or arrive twice). They are one person, so they show as one row
  // and are always selected and given to an agent together.
  const byPerson = new Map<string, Unassigned[]>();
  for (const l of data?.unassigned ?? []) {
    const key = l.phone && digitsOf(l.phone).length >= 7 ? digitsOf(l.phone) : l.id;
    byPerson.set(key, [...(byPerson.get(key) ?? []), l]);
  }
  const clusters = [...byPerson.entries()].map(([key, leads]) => ({ key, leads, lead: leads[0], ids: leads.map((x) => x.id) }));
  const rows = clusters.filter((c) => !needle || c.leads.some((l) => [l.name, l.phone ?? "", l.listing ?? "", l.listingReference ?? "", l.region ?? ""].some((v) => v.toLowerCase().includes(needle))));
  const teamNames = new Set(agents.map((a) => a.name.trim().toLowerCase()));
  const oldest = data && data.unassigned.length ? Math.min(...data.unassigned.map((l) => new Date(l.receivedAt).getTime())) : null;
  const openTotal = agents.reduce((n, a) => n + a.open, 0);
  const waitTone = (iso: string) => {
    const h = (nowMs - new Date(iso).getTime()) / HOUR;
    return h > 72 ? { bg: "#fee2e2", fg: "#b91c1c" } : h > 24 ? { bg: "#fef3c7", fg: "#b45309" } : { bg: "#f1f5f9", fg: "#64748b" };
  };

  return (
    <div className="px-4 pb-24 lg:px-0 lg:pb-12 page-in">
      <div className="pt-4 lg:pt-8">
        <div className="mb-4 flex items-center gap-2 text-[13px] text-muted">
          <Link href="/leads" className="inline-flex items-center gap-1 font-medium transition-colors hover:text-slate-900">
            <IconChevronLeft size={15} />
            Leads
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-medium text-slate-700">Assignment</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
          <div>
            <h1 className="text-xl font-bold lg:text-[28px] lg:font-semibold lg:leading-none lg:tracking-[-0.025em]">Lead assignment</h1>
            <p className="mt-1 text-[13px] text-muted lg:mt-2.5 lg:text-[15px]">Hand waiting leads to an agent. Property Finder leads go to the listing&apos;s owner on their own.</p>
          </div>
          <Link href="/leads/rules" className="rounded-xl border border-border bg-surface px-4 py-2.5 text-[13.5px] font-semibold shadow-sm transition-colors hover:bg-surface-muted">
            Assignment rules
          </Link>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-[13.5px] ${msg.ok ? "bg-success-bg" : "bg-danger-bg text-danger"}`} style={msg.ok ? { color: "var(--success)" } : undefined}>
          {msg.text}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[
          { label: "People waiting", value: data ? String(clusters.length) : "–", hint: data && data.unassigned.length ? `${data.unassigned.length} enquiries · oldest ${timeAgo(new Date(oldest ?? 0).toISOString())}` : "Inbox is clear", tone: data && data.unassigned.length ? "#f59e0b" : "#16a34a" },
          { label: "Active agents", value: data ? String(agents.length) : "–", hint: leastBusy ? `${leastBusy.name} is least busy` : "Who can take leads", tone: "#2b4fc0" },
          { label: "Open leads", value: data ? String(openTotal) : "–", hint: "Across the whole team", tone: "#06b6d4" },
          { label: "Average per agent", value: data && agents.length ? (openTotal / agents.length).toFixed(1) : "–", hint: "Open leads each", tone: "#8b5cf6" },
        ].map((t) => (
          <div key={t.label} className="relative overflow-hidden rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm lg:p-5">
            <span className="absolute inset-x-0 top-0 h-1" style={{ background: t.tone }} />
            <div className="text-[12.5px] font-medium text-muted">{t.label}</div>
            <div className="tnum mt-1.5 text-[26px] font-bold leading-none tracking-tight lg:mt-2" style={{ color: t.tone }}>{t.value}</div>
            <div className="mt-1.5 line-clamp-2 text-[12px] text-muted lg:mt-2">{t.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-6">
        {/* Unassigned inbox */}
        <section className={`${card} min-w-0 overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-[16px] font-semibold">Unassigned inbox</h2>
              <p className="text-[12.5px] text-muted">{data ? (needle ? `${rows.length} of ${clusters.length} people waiting for an agent` : `${clusters.length} ${clusters.length === 1 ? "person" : "people"} waiting for an agent${data.unassigned.length !== clusters.length ? ` · ${data.unassigned.length} enquiries` : ""}`) : "Loading…"}</p>
            </div>
            {data && data.unassigned.length > 0 && picked.size === 0 && (
              <div className="flex min-w-[220px] items-center gap-2 rounded-xl border border-border bg-white px-3 shadow-sm focus-within:border-primary">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input data-bare value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or property" aria-label="Search unassigned leads" className="h-10 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none" />
              </div>
            )}
            {picked.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full px-2.5 py-1 text-[12.5px] font-semibold text-white" style={{ background: "linear-gradient(135deg, #2b4fc0, #06b6d4)" }}>{picked.size} selected</span>
                <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-[13.5px] outline-none">
                  <option value="">Choose agent…</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.open} open)
                    </option>
                  ))}
                </select>
                <button type="button" onClick={assign} disabled={busy || !agentId} className="rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--primary)" }}>
                  Assign
                </button>
                {agents.length > 1 && (
                  <button type="button" onClick={spreadEvenly} disabled={busy} title="Gives each lead to whoever has the fewest open leads at that moment" className="rounded-lg border border-border bg-white px-3.5 py-2 text-[13.5px] font-semibold hover:bg-primary-soft disabled:opacity-50">
                    Spread evenly
                  </button>
                )}
                <button type="button" onClick={() => setPicked(new Set())} className="rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted hover:text-foreground">
                  Clear
                </button>
              </div>
            )}
          </div>

          {!data ? (
            <div className="space-y-2 p-5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-muted" />
              ))}
            </div>
          ) : data.unassigned.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-[22px]" style={{ color: "var(--success)" }}>
                ✓
              </div>
              <p className="text-[15px] font-semibold">Inbox is clear</p>
              <p className="mt-1 text-[13px] text-muted">Every lead has an agent.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/60 text-[11.5px] font-semibold uppercase tracking-wider text-muted">
                    <th className="w-10 px-5 py-3">
                      <input type="checkbox" aria-label="Select all" checked={Boolean(allPicked)} onChange={() => setPicked(allPicked ? new Set() : new Set(data.unassigned.map((l) => l.id)))} />
                    </th>
                    <th className="px-3 py-3">Lead</th>
                    <th className="px-3 py-3">Property / region</th>
                    <th className="px-3 py-3">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const l = c.lead;
                    const on = c.ids.every((id) => picked.has(id));
                    const junk = !hasText(l.name.trim()) && l.name.trim() !== "";
                    const isTeam = teamNames.has(l.name.trim().toLowerCase());
                    const raw = isRawRef(l.listingReference);
                    return (
                      <tr key={c.key} style={!on && c.leads.some((x) => isFreshLead(x)) ? FRESH_STYLE : undefined} className={`border-b border-border last:border-b-0 hover:bg-accent-light/40 ${on ? "bg-accent-light/60" : ""}`}>
                        <td className="px-5 py-3.5">
                          <input
                            type="checkbox"
                            aria-label={`Select ${leadLabel(l)}`}
                            checked={on}
                            onChange={() =>
                              setPicked((p) => {
                                const n = new Set(p);
                                for (const id of c.ids) {
                                  if (on) n.delete(id);
                                  else n.add(id);
                                }
                                return n;
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link href={`/leads/${l.id}`} className="text-[14px] font-semibold hover:text-primary">
                              {leadLabel(l)}
                            </Link>
                            {c.leads.some((x) => isFreshLead(x)) && <FreshBadge />}
                            {c.leads.length > 1 && (
                              <span title={`${c.leads.length} enquiries from this number`} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "#ede9fe", color: "#5b21b6" }}>
                                ×{c.leads.length}
                              </span>
                            )}
                            {isTeam && <span title="This name matches someone on your team, so it may have been imported by mistake" className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "#fef3c7", color: "#b45309" }}>Team member?</span>}
                            {junk && <span title="The name has no letters or numbers, so this may be spam" className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "#fee2e2", color: "#b91c1c" }}>Check lead</span>}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-muted">
                            {l.phone ?? "No phone"}
                            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: (CHANNEL_STYLE[l.channel] ?? CHANNEL_STYLE.OTHER).bg, color: (CHANNEL_STYLE[l.channel] ?? CHANNEL_STYLE.OTHER).fg }}>{CHANNEL_LABELS[l.channel]}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-[13px]">
                          <div className="font-medium" title={raw ? (l.listingReference ?? undefined) : undefined}>{l.listing ?? (raw ? "Property Finder listing" : l.listingReference) ?? "General enquiry"}</div>
                          <div className="text-[12px] text-muted">{l.region ?? (raw && !l.listing ? `Ref ${l.listingReference!.slice(0, 6)}…` : "—")}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 text-[13px]"><span className="rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: waitTone(l.receivedAt).bg, color: waitTone(l.receivedAt).fg }}>{timeAgo(l.receivedAt)}</span></td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-[13.5px] text-muted">No waiting leads match “{q}”.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Workload */}
        <section className={`${card} p-5`}>
          <h2 className="text-[16px] font-semibold">Workload</h2>
          <p className="text-[12.5px] text-muted">Open leads per agent</p>
          <ul className="mt-4 flex flex-col gap-4">
            {agents.map((a) => (
              <li key={a.id}>
                <div className="flex items-center gap-2.5">
                  <Avatar name={a.name} avatarUrl={a.avatarUrl} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 truncate text-[13.5px] font-medium">
                      {a.name}
                      {leastBusy?.id === a.id && <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: "#dcfce7", color: "#15803d" }}>Least busy</span>}
                    </div>
                    <div className="text-[11.5px] text-muted">
                      {a.total} total · {a.won} won · {a.avgResponseMinutes === null ? "no response data" : `avg response ${a.avgResponseMinutes < 60 ? `${a.avgResponseMinutes} min` : `${Math.round(a.avgResponseMinutes / 60)} h`}`}
                    </div>
                  </div>
                  <span className="tnum text-[15px] font-bold" style={{ color: colorOf.get(a.id) }}>{a.open}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(a.open / maxOpen) * 100}%`, background: `linear-gradient(90deg, ${colorOf.get(a.id)}, ${colorOf.get(a.id)}bb)` }} />
                </div>
              </li>
            ))}
            {data && agents.length === 0 && <li className="text-[13px] text-muted">No active agents.</li>}
          </ul>
        </section>
      </div>

      {/* Audit */}
      <section className={`${card} mt-6 p-5 lg:p-6`}>
        <h2 className="text-[16px] font-semibold">Assignment history</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {(data?.audit ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 text-[13.5px]">
              <span className="min-w-0">
                <Link href={`/leads/${a.lead.id}`} className="font-medium hover:text-primary">
                  {a.lead.name}
                </Link>
                <span className="text-muted"> · {a.text}</span>
              </span>
              <span className="shrink-0 text-[12px] text-muted">
                {a.by ? `by ${a.by} · ` : "automatic · "}
                {timeAgo(a.createdAt)}
              </span>
            </li>
          ))}
          {data && data.audit.length === 0 && <li className="py-6 text-center text-[13px] text-muted">Nothing assigned yet.</li>}
        </ul>
      </section>
    </div>
  );
}
