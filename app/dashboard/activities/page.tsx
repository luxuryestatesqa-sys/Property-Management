"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";
import { ACTIVITY_TYPES, SOURCE_FILTERS, TYPE_INFO, typeLabel, describe, type ActivityRow } from "@/lib/activityTypes";
import { formatMinutes } from "@/lib/dashboardStats";
import { listingCode } from "@/lib/format";

// ---------- Qatar-time date helpers (Asia/Qatar is UTC+3, no daylight saving) ----------
const TZ = "Asia/Qatar";
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const today = () => ymd(new Date());
const shift = (day: string, n: number) => ymd(new Date(new Date(`${day}T12:00:00+03:00`).getTime() + n * 86400000));
const monthStart = (day: string) => `${day.slice(0, 8)}01`;
const dayLabel = (day: string) => new Date(`${day}T12:00:00+03:00`).toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const timeOnly = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "90d", label: "Last 90 days" },
] as const;

function presetRange(key: string): { from: string; to: string } {
  const t = today();
  if (key === "today") return { from: t, to: t };
  if (key === "yesterday") return { from: shift(t, -1), to: shift(t, -1) };
  if (key === "month") return { from: monthStart(t), to: t };
  if (key === "lastmonth") {
    const lastDay = shift(monthStart(t), -1);
    return { from: monthStart(lastDay), to: lastDay };
  }
  if (key === "90d") return { from: shift(t, -89), to: t };
  return { from: shift(t, -6), to: t };
}

// ---------- types ----------
interface Summary {
  kpis: { total: number; calls: number; whatsapp: number; viewings: number; stages: number; published: number };
  leaderboard: { agentId: string | null; name: string; calls: number; whatsapp: number; notes: number; viewings: number; stages: number; listings: number; other: number; won: number; total: number; avgFirstResponseMinutes: number | null }[];
  perDay: { day: string; n: number }[];
  meta: { agents: { id: string; name: string; avatarUrl: string | null }[]; stages: string[]; oldStages?: string[]; canSeeAll: boolean };
}

// ---------- small building blocks ----------
function Icon({ d, size = 15 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

// One colour per kind of activity (same palette as the dashboard), so a row can be read at a glance.
const TYPE_COLORS: Record<string, string> = {
  lead_created: "#2b4fc0", lead_assigned: "#8b5cf6", stage_changed: "#f59e0b", note_added: "#64748b", call_logged: "#06b6d4",
  whatsapp_sent: "#16a34a", document_uploaded: "#0ea5e9", voice_note: "#ec4899", followup_set: "#f59e0b", followup_done: "#16a34a",
  viewing_scheduled: "#ec4899", viewing_completed: "#16a34a", viewing_cancelled: "#f43f5e", property_linked: "#2b4fc0", group_changed: "#14b8a6",
  lead_merged: "#8b5cf6", lead_deleted: "#f43f5e", listing_created: "#8b5cf6", listing_edited: "#6366f1", listing_status_changed: "#f59e0b",
  listing_published: "#16a34a", listing_unpublished: "#f97316", listing_portal_error: "#f43f5e", listing_activated: "#16a34a", listing_deactivated: "#f43f5e",
  user_login: "#14b8a6", user_added: "#0ea5e9", role_changed: "#8b5cf6",
};
const typeColor = (t: string) => TYPE_COLORS[t] ?? "#2b4fc0";

function TypeBadge({ type }: { type: string }) {
  const info = TYPE_INFO.get(type);
  const c = typeColor(type);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] font-medium text-text-body">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${c}1f`, color: c }}>
        <Icon d={info?.icon ?? "M12 5v14"} size={14} />
      </span>
      <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: `${c}14`, color: c }}>{typeLabel(type)}</span>
    </span>
  );
}

const MIX: readonly (readonly [string, string])[] = [["calls", "#06b6d4"], ["whatsapp", "#16a34a"], ["notes", "#64748b"], ["viewings", "#ec4899"], ["stages", "#f59e0b"], ["listings", "#8b5cf6"], ["other", "#94a3b8"]];

interface Option {
  value: string;
  label: string;
  group?: string;
  avatar?: { name: string; avatarUrl: string | null };
}

const Kpi = ({ label, value, accent }: { label: string; value: number | string; accent: string }) => (
  <div className="relative overflow-hidden rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm lg:p-5">
    <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
    <div className="text-[12.5px] font-medium text-muted">{label}</div>
    <div className="tnum mt-1.5 text-[26px] font-bold leading-none tracking-tight lg:mt-2 lg:text-[30px]" style={{ color: accent }}>{value}</div>
  </div>
);

// A month calendar: click a day to see just that day, click it again to go back. Days with activity get a dot.
function Calendar({ month, setMonth, from, to, counts, onPick }: { month: string; setMonth: (m: string) => void; from: string; to: string; counts: Map<string, number>; onPick: (day: string) => void }) {
  const t = today();
  const first = `${month}-01`;
  const lead = (new Date(`${first}T12:00:00+03:00`).getUTCDay() + 6) % 7; // Monday first
  const [y, m] = month.split("-").map(Number);
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const stepMonth = (n: number) => setMonth(ymd(new Date(Date.UTC(y, m - 1 + n, 15, 12))).slice(0, 7));
  const title = new Date(`${first}T12:00:00+03:00`).toLocaleDateString("en-GB", { timeZone: TZ, month: "long", year: "numeric" });
  const single = from === to;
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold text-text">{title}</span>
        <div className="flex gap-1">
          <button type="button" onClick={() => stepMonth(-1)} aria-label="Previous month" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-primary-soft"><Icon d="m15 6-6 6 6 6" size={16} /></button>
          <button type="button" onClick={() => stepMonth(1)} aria-label="Next month" disabled={month >= t.slice(0, 7)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-primary-soft disabled:opacity-30"><Icon d="m9 6 6 6-6 6" size={16} /></button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="pb-1 text-[11.5px] font-medium text-muted">{d}</span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const future = d > t;
          const selected = single && d === from;
          const inRange = !single && d >= from && d <= to;
          const n = counts.get(d) ?? 0;
          return (
            <button
              key={d}
              type="button"
              disabled={future}
              onClick={() => onPick(d)}
              title={n ? `${n} activit${n === 1 ? "y" : "ies"}` : undefined}
              aria-label={`${new Date(`${d}T12:00:00+03:00`).toLocaleDateString("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" })}${n ? `, ${n} activit${n === 1 ? "y" : "ies"}` : ""}`}
              aria-pressed={selected}
              className={`relative mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-[13px] transition-colors ${selected ? "font-semibold text-white" : inRange ? "bg-primary-soft font-medium text-primary" : future ? "text-muted opacity-40" : "text-text-body hover:bg-primary-soft"}`}
              style={selected ? { background: "linear-gradient(135deg, #2b4fc0, #06b6d4)" } : d === t && !inRange ? { boxShadow: "inset 0 0 0 1.5px var(--primary)" } : undefined}
            >
              {Number(d.slice(8))}
              {n > 0 && <span className="absolute bottom-[3px] h-1 w-1 rounded-full" style={{ background: selected ? "#fff" : "#06b6d4" }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- the page ----------
function ActivitiesInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { data: session, status } = useSession();

  // The URL is the source of truth for every filter, so a filtered view can be bookmarked or shared.
  const range = sp.get("range") ?? (sp.get("from") || sp.get("to") ? "custom" : "7d");
  const resolved = range === "custom" ? { from: sp.get("from") ?? shift(today(), -6), to: sp.get("to") ?? today() } : presetRange(range);
  const agents = useMemo(() => (sp.get("agents") ?? "").split(",").filter(Boolean), [sp]);
  const types = useMemo(() => (sp.get("types") ?? "").split(",").filter(Boolean), [sp]);
  const sources = useMemo(() => (sp.get("sources") ?? "").split(",").filter(Boolean), [sp]);
  const stage = sp.get("stage") ?? "";
  const property = sp.get("property") ?? "";
  const lead = sp.get("lead") ?? "";

  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const n = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) (v ? n.set(k, v) : n.delete(k));
      router.replace(`/dashboard/activities${n.toString() ? `?${n}` : ""}`, { scroll: false });
    },
    [router, sp]
  );

  // Query string sent to the API (same filters; the date is always explicit).
  const apiQs = useMemo(() => {
    const n = new URLSearchParams();
    n.set("from", resolved.from);
    n.set("to", resolved.to);
    if (agents.length) n.set("agents", agents.join(","));
    if (types.length) n.set("types", types.join(","));
    if (sources.length) n.set("sources", sources.join(","));
    if (stage) n.set("stage", stage);
    if (property) n.set("property", property);
    if (lead) n.set("lead", lead);
    return n.toString();
  }, [resolved.from, resolved.to, agents, types, sources, stage, property, lead]);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<ActivityRow | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "total", dir: -1 });
  const [sortDate, setSortDate] = useState<"newest" | "oldest">("newest");
  const [propertyDraft, setPropertyDraft] = useState(property);
  const [leadDraft, setLeadDraft] = useState(lead);
  const [showFilters, setShowFilters] = useState(false); // phones: calendar and filters open on demand
  const [month, setMonth] = useState(() => resolved.to.slice(0, 7));

  useEffect(() => setPropertyDraft(property), [property]);
  useEffect(() => setLeadDraft(lead), [lead]);
  // Search boxes apply after a short pause, not on every key.
  useEffect(() => {
    const t = setTimeout(() => (propertyDraft !== property || leadDraft !== lead) && set({ property: propertyDraft.trim() || null, lead: leadDraft.trim() || null }), 450);
    return () => clearTimeout(t);
  }, [propertyDraft, leadDraft, property, lead, set]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([fetch(`/api/activities/summary?${apiQs}`), fetch(`/api/activities?${apiQs}&sort=${sortDate === "oldest" ? "oldest" : "newest"}`)])
      .then(async ([s, l]) => {
        if (!s.ok || !l.ok) throw new Error();
        const [sd, ld] = await Promise.all([s.json(), l.json()]);
        if (cancelled) return;
        setSummary(sd);
        setRows(ld.rows);
        setTotal(ld.total);
      })
      .catch(() => !cancelled && setError("Couldn't load activities"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [apiQs, status, sortDate]);

  async function loadMore() {
    setMore(true);
    try {
      const res = await fetch(`/api/activities?${apiQs}&sort=${sortDate === "oldest" ? "oldest" : "newest"}&offset=${rows.length}`);
      if (res.ok) {
        const d = await res.json();
        setRows((r) => [...r, ...d.rows]);
      }
    } finally {
      setMore(false);
    }
  }

  const manager = summary?.meta.canSeeAll ?? ["OWNER", "ADMIN", "MANAGER"].includes(session?.user?.role ?? "");
  const agentOptions: Option[] = [...(summary?.meta.agents ?? []).map((a) => ({ value: a.id, label: a.name, avatar: { name: a.name, avatarUrl: a.avatarUrl } })), { value: "system", label: "System / Unassigned" }];
  const sourceOptions: Option[] = SOURCE_FILTERS.map((s) => ({ value: s.key, label: s.label }));
  const agentAvatar = useMemo(() => new Map((summary?.meta.agents ?? []).map((a) => [a.id, a])), [summary]);

  const filtersActive = agents.length + types.length + sources.length > 0 || Boolean(stage || property || lead) || range !== "7d";
  const clearAll = () => set({ range: null, from: null, to: null, agents: null, types: null, stage: null, sources: null, property: null, lead: null });

  // leaderboard sorting
  const board = useMemo(() => {
    const k = sort.key as keyof Summary["leaderboard"][number];
    return [...(summary?.leaderboard ?? [])].sort((a, b) => {
      const x = a[k], y = b[k];
      if (typeof x === "string" || typeof y === "string") return String(x ?? "").localeCompare(String(y ?? "")) * sort.dir;
      return (((x as number | null) ?? -1) - ((y as number | null) ?? -1)) * sort.dir;
    });
  }, [summary, sort]);
  const th = (key: string, label: string, align = "text-right") => (
    <th className={`whitespace-nowrap px-3 py-2.5 ${align}`}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))} className="inline-flex items-center gap-1 uppercase hover:text-primary">
        {label}
        {sort.key === key && <span aria-hidden>{sort.dir === -1 ? "↓" : "↑"}</span>}
      </button>
    </th>
  );

  // timeline grouping by Qatar day
  const grouped = useMemo(() => {
    const t = today(), y = shift(t, -1);
    const out: { day: string; label: string; items: ActivityRow[] }[] = [];
    for (const r of rows) {
      const day = ymd(new Date(r.createdAt));
      let g = out[out.length - 1];
      if (!g || g.day !== day) out.push((g = { day, label: day === t ? "Today" : day === y ? "Yesterday" : dayLabel(day), items: [] }));
      g.items.push(r);
    }
    return out;
  }, [rows]);

  const input = "h-11 w-full rounded-xl border border-border bg-surface-elevated px-3.5 text-[13.5px] outline-none";
  const who = (r: ActivityRow) => r.agentName ?? (r.agentId ? "Former team member" : "System");
  const AgentCell = ({ r }: { r: ActivityRow }) => {
    const a = r.agentId ? agentAvatar.get(r.agentId) : null;
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        {r.agentId ? <Avatar name={who(r)} avatarUrl={a?.avatarUrl ?? null} size={24} /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-muted text-[10px] font-bold text-muted">SYS</span>}
        {who(r)}
      </span>
    );
  };
  const LeadCell = ({ r }: { r: ActivityRow }) => (r.leadId && r.leadName ? <Link href={`/leads/${r.leadId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-text hover:text-primary">{r.leadName}</Link> : <span className="text-muted">{r.type === "lead_deleted" ? r.note ?? "Deleted lead" : "—"}</span>);
  const PropCell = ({ r }: { r: ActivityRow }) => (r.listingId ? <Link href={`/property/${r.listingId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-text hover:text-primary">{listingCode(r.listingId)}{r.listingName ? ` · ${r.listingName}` : ""}</Link> : <span className="text-muted">—</span>);

  const activePreset = PRESETS.find((p) => { const r = presetRange(p.key); return r.from === resolved.from && r.to === resolved.to; })?.key;
  const dayCounts = useMemo(() => new Map((summary?.perDay ?? []).map((x) => [x.day, x.n])), [summary]);
  const pickDay = (d: string) => (resolved.from === d && resolved.to === d ? set({ range: null, from: null, to: null }) : set({ range: "custom", from: d, to: d }));
  const toggleIn = (list: string[], key: string, v: string) => set({ [key]: (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]).join(",") || null });
  const filterCount = agents.length + types.length + sources.length + (stage ? 1 : 0) + (property ? 1 : 0) + (lead ? 1 : 0);
  const typeGroups = (["Lead", "Listing", "User"] as const).map((g) => ({ group: g, items: ACTIVITY_TYPES.filter((t) => t.group === g) }));
  const box = (on: boolean, c = "#2b4fc0") => (
    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border" style={on ? { background: c, borderColor: c, color: "#fff" } : { borderColor: "#cbd5e1", background: "#fff" }}>
      {on && <Icon d="M5 12.5l4.5 4.5L19 7.5" size={12} />}
    </span>
  );
  const panel = "rounded-2xl border border-border bg-surface-elevated shadow-sm";

  return (
    <div className="page-in px-4 pb-24 lg:px-0 lg:pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-4 pt-4 lg:gap-4 lg:pb-6 lg:pt-10">
        <div>
          <h1 className="text-xl font-bold leading-none lg:text-[28px] lg:font-semibold lg:tracking-[-0.025em]">Activities</h1>
          <div className="mt-3 h-1 w-14 rounded-full" style={{ background: "linear-gradient(90deg, #2b4fc0, #06b6d4, #16a34a, #f59e0b, #ec4899)" }} />
          <p className="mt-3 text-[13px] text-muted lg:text-[15px]">{manager ? "Everything your team did: leads, listings and users." : "Everything you did: leads, listings and your account."}</p>
        </div>
        <a href={`/api/activities/export?${apiQs}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3.5 text-[13.5px] font-semibold shadow-sm transition-colors hover:bg-primary-soft lg:h-11 lg:px-4">
          <Icon d="M12 3v12M7 10l5 5 5-5M5 21h14" />
          <span className="hidden sm:inline">Export </span>CSV
        </a>
      </div>

      {error && <div className="mb-4 rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>}

      {/* numbers for the chosen period */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4 xl:grid-cols-6">
        {summary
          ? [
              ["Total activities", summary.kpis.total, "#2b4fc0"],
              ["Calls", summary.kpis.calls, "#06b6d4"],
              ["WhatsApp messages", summary.kpis.whatsapp, "#16a34a"],
              ["Viewings", summary.kpis.viewings, "#ec4899"],
              ["Stage changes", summary.kpis.stages, "#f59e0b"],
              ["Listings published", summary.kpis.published, "#8b5cf6"],
            ].map(([l, v, c]) => <Kpi key={l as string} label={l as string} value={(v as number).toLocaleString()} accent={c as string} />)
          : [1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-[92px] animate-pulse rounded-2xl" />)}
      </div>

      {/* phones and tablets: one tap opens the calendar and filters */}
      <button type="button" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface-elevated px-4 py-3 text-left shadow-sm lg:hidden">
        <span className="flex min-w-0 items-center gap-2.5">
          <Icon d="M3 4h18l-7 9v6l-4 2v-8z" size={17} />
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold">Calendar and filters{filterCount > 0 ? ` (${filterCount})` : ""}</span>
            <span className="block truncate text-[12.5px] text-muted">{resolved.from === resolved.to ? dayLabel(resolved.from) : `${dayLabel(resolved.from)} – ${dayLabel(resolved.to)}`}</span>
          </span>
        </span>
        <Icon d={showFilters ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} size={16} />
      </button>

      <div className="mt-4 grid items-start gap-6 lg:mt-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* left: calendar + filters */}
        <aside className={`${showFilters ? "flex" : "hidden"} flex-col gap-6 lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1`}>
          <section>
            <h2 className="mb-3 hidden text-[18px] font-semibold lg:block">Calendar</h2>
            <div className={`${panel} p-4`}>
              <Calendar month={month} setMonth={setMonth} from={resolved.from} to={resolved.to} counts={dayCounts} onPick={pickDay} />
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-3">
                {PRESETS.map((p) => (
                  <button key={p.key} type="button" onClick={() => { setMonth(presetRange(p.key).to.slice(0, 7)); set({ range: p.key === "7d" ? null : p.key, from: null, to: null }); }} aria-pressed={activePreset === p.key} className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${activePreset === p.key ? "text-white" : "bg-primary-soft text-primary hover:bg-primary-soft/70"}`} style={activePreset === p.key ? { background: "linear-gradient(135deg, #2b4fc0, #06b6d4)" } : undefined}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold">Filters ({filterCount})</h2>
              {filterCount > 0 && (
                <button type="button" onClick={() => set({ agents: null, types: null, stage: null, sources: null, property: null, lead: null })} className="text-[13px] font-semibold text-primary hover:underline">
                  Clear
                </button>
              )}
            </div>
            <div className={`${panel} divide-y divide-border`}>
              <div className="flex flex-col gap-2 p-4">
                <input value={leadDraft} onChange={(e) => setLeadDraft(e.target.value)} placeholder="Search lead name or phone" aria-label="Search lead" className={input} />
                <input value={propertyDraft} onChange={(e) => setPropertyDraft(e.target.value)} placeholder="Search property ID or building" aria-label="Search property" className={input} />
              </div>

              {manager && (
                <div className="p-4">
                  <h3 className="label-caps mb-2 !text-[11px]">By agent</h3>
                  <ul className="flex flex-col">
                    {agentOptions.map((o) => (
                      <li key={o.value}>
                        <button type="button" role="checkbox" aria-checked={agents.includes(o.value)} onClick={() => toggleIn(agents, "agents", o.value)} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-[14px] hover:bg-primary-soft">
                          {o.avatar ? <Avatar name={o.avatar.name} avatarUrl={o.avatar.avatarUrl} size={22} /> : <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-surface-muted text-[9px] font-bold text-muted">SYS</span>}
                          <span className="flex-1 truncate">{o.label}</span>
                          {box(agents.includes(o.value))}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="p-4">
                <h3 className="label-caps mb-2 !text-[11px]">By activity type</h3>
                {typeGroups.map((g) => (
                  <div key={g.group} className="mb-2 last:mb-0">
                    <div className="px-1 pb-1 pt-2 text-[11.5px] font-semibold text-muted">{g.group === "User" ? "Team" : g.group + "s"}</div>
                    <ul className="flex flex-col">
                      {g.items.map((t) => {
                        const c = typeColor(t.type);
                        return (
                          <li key={t.type}>
                            <button type="button" role="checkbox" aria-checked={types.includes(t.type)} onClick={() => toggleIn(types, "types", t.type)} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-[14px] hover:bg-primary-soft">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: `${c}1f`, color: c }}><Icon d={t.icon} size={13} /></span>
                              <span className="flex-1 truncate">{t.label}</span>
                              {box(types.includes(t.type), c)}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="p-4">
                <h3 className="label-caps mb-2 !text-[11px]">By source</h3>
                <ul className="flex flex-col">
                  {sourceOptions.map((o) => (
                    <li key={o.value}>
                      <button type="button" role="checkbox" aria-checked={sources.includes(o.value)} onClick={() => toggleIn(sources, "sources", o.value)} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-[14px] hover:bg-primary-soft">
                        <span className="flex-1">{o.label}</span>
                        {box(sources.includes(o.value))}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4">
                <h3 className="label-caps mb-2 !text-[11px]">Lead stage</h3>
                <select aria-label="Stage" value={stage} onChange={(e) => set({ stage: e.target.value || null })} className={input}>
                  <option value="">Any stage</option>
                  {(summary?.meta.stages ?? []).map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                  {(summary?.meta.oldStages ?? []).length > 0 && (
                    <optgroup label="Old stages (no longer used)">
                      {(summary?.meta.oldStages ?? []).map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>
          </section>
        </aside>

        {/* right: timeline */}
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold lg:text-[18px]">
              Timeline <span className="ml-1 text-[14px] font-normal text-muted">{loading ? "Loading…" : `${total.toLocaleString()} ${total === 1 ? "activity" : "activities"} · ${resolved.from === resolved.to ? dayLabel(resolved.from) : `${dayLabel(resolved.from)} – ${dayLabel(resolved.to)}`}`}</span>
            </h2>
            <button type="button" onClick={() => setSortDate((x) => (x === "newest" ? "oldest" : "newest"))} className="ml-auto h-9 shrink-0 whitespace-nowrap rounded-xl border border-border bg-surface-elevated px-3.5 text-[13px] font-medium shadow-sm">
              {sortDate === "newest" ? "Newest first ↓" : "Oldest first ↑"}
            </button>
          </div>

          <div className={`${panel} overflow-hidden p-4 sm:p-5`}>
            {loading && rows.length === 0 ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-[17px] font-semibold">No activities for these filters</p>
                <p className="mt-1.5 text-[14px] text-muted">Try another day or remove a filter.</p>
                {filtersActive && (
                  <button type="button" onClick={clearAll} className="mt-5 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white" style={{ background: "var(--primary)" }}>
                    Reset everything
                  </button>
                )}
              </div>
            ) : (
              <div className={`flex flex-col gap-8 transition-opacity ${loading ? "opacity-60" : ""}`}>
                {grouped.map((g) => (
                  <div key={g.day} className="grid gap-x-5 min-[1500px]:grid-cols-[150px_minmax(0,1fr)]">
                    <div className="flex flex-wrap items-baseline gap-x-3 pb-3 min-[1500px]:sticky min-[1500px]:top-4 min-[1500px]:block min-[1500px]:self-start">
                      <div className="text-[13px] font-bold uppercase tracking-wide text-text">{new Date(`${g.day}T12:00:00+03:00`).toLocaleDateString("en-GB", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" })}</div>
                      <div className="text-[13px] text-muted">{g.label === "Today" || g.label === "Yesterday" ? g.label : new Date(`${g.day}T12:00:00+03:00`).toLocaleDateString("en-GB", { timeZone: TZ, weekday: "long" })}</div>
                      <button type="button" onClick={() => pickDay(g.day)} className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold hover:underline" style={{ color: "#0891b2" }}>
                        <Icon d="M3 3v18h18M7 15l4-4 3 3 5-6" size={13} />
                        {(dayCounts.get(g.day) ?? g.items.length).toLocaleString()} activities
                      </button>
                    </div>
                    <ol className="relative flex min-w-0 flex-col">
                      <span aria-hidden className="absolute bottom-3 left-[19px] top-3 w-px bg-border sm:left-[95px]" />
                      {g.items.map((r) => {
                        const c = typeColor(r.type);
                        const a = r.agentId ? agentAvatar.get(r.agentId) : null;
                        const subject = r.leadName ?? (r.listingName ? `${listingCode(r.listingId!)} · ${r.listingName}` : null);
                        const detail = describe(r);
                        // No lead or property (a sign-in, a new user): the sentence itself is the title.
                        const title = subject ?? (TYPE_INFO.get(r.type)?.group === "Lead" ? (r.type === "lead_deleted" ? (r.note ?? "Deleted lead") : "Deleted or merged lead") : detail || typeLabel(r.type));
                        const showDetail = (subject || TYPE_INFO.get(r.type)?.group === "Lead") && detail && r.type !== "lead_deleted" && !(/^(added|imported)\b.*\bby /i.test(detail) && detail.includes(who(r)));
                        const showPill = !(title === typeLabel(r.type));
                        return (
                          <li key={r.id} className="relative flex min-w-0 gap-3.5 py-2.5">
                            <span className="tnum hidden w-[62px] shrink-0 pt-2.5 text-right text-[12.5px] text-muted sm:block">{timeOnly(r.createdAt)}</span>
                            <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm" style={{ background: c }}>
                              <Icon d={TYPE_INFO.get(r.type)?.icon ?? "M12 5v14"} size={16} />
                            </span>
                            <button type="button" onClick={() => setOpen(r)} className="min-w-0 flex-1 rounded-xl px-2 py-1 text-left transition-colors hover:bg-surface">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-[15px] font-semibold text-text">{title}</span>
                                {showPill && <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${c}14`, color: c }}>{typeLabel(r.type)}</span>}
                              </div>
                              {showDetail && <div className="mt-0.5 line-clamp-2 text-[13px] text-text-body">{detail}</div>}
                              <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted">
                                {r.agentId ? <Avatar name={who(r)} avatarUrl={a?.avatarUrl ?? null} size={16} /> : <Icon d="M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" size={13} />}
                                by {who(r)}
                                <span className="sm:hidden"> · {timeOnly(r.createdAt)}</span>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ))}
              </div>
            )}

            {rows.length < total && (
              <div className="mt-6 flex flex-col items-center gap-1.5 border-t border-border pt-5">
                <span className="text-[12.5px] text-muted">Showing {rows.length.toLocaleString()} of {total.toLocaleString()}</span>
                <button type="button" onClick={loadMore} disabled={more} className="rounded-xl px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, #2b4fc0, #06b6d4)" }}>
                  {more ? "Loading…" : sortDate === "newest" ? "Load older activities" : "Load newer activities"}
                </button>
              </div>
            )}
          </div>

          {manager && summary && (
            <details className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-sm">
              <summary className="cursor-pointer select-none px-5 py-4 text-[15px] font-semibold">Agent leaderboard <span className="ml-1 text-[13px] font-normal text-muted">for this period</span></summary>
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full min-w-[760px] text-[13.5px]">
                  <thead>
                    <tr>
                      {th("name", "Agent", "text-left")}
                      {th("calls", "Calls")}
                      {th("whatsapp", "WhatsApp")}
                      {th("notes", "Notes")}
                      {th("viewings", "Viewings")}
                      {th("stages", "Stages")}
                      {th("listings", "Listings")}
                      {th("other", "Other")}
                      {th("total", "Total")}
                      {th("won", "Won")}
                      {th("avgFirstResponseMinutes", "Avg 1st reply")}
                    </tr>
                  </thead>
                  <tbody>
                    {board.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-5 py-8 text-center text-muted">No activity in this range.</td>
                      </tr>
                    )}
                    {board.map((b) => (
                      <tr key={b.agentId ?? "system"} className={`cursor-pointer border-t border-border ${agents.length === 1 && agents[0] === (b.agentId ?? "system") ? "is-selected" : ""}`} onClick={() => set({ agents: b.agentId ?? "system" })}>
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium text-text">
                          {b.name}
                          <div className="mt-1.5 flex h-1.5 w-32 overflow-hidden rounded-full" style={{ background: "var(--primary-soft)" }} title="Mix of activity types">
                            {MIX.map(([k, col]) => (
                              <span key={k} style={{ width: `${b.total ? ((b as unknown as Record<string, number>)[k] / b.total) * 100 : 0}%`, background: col }} />
                            ))}
                          </div>
                        </td>
                        {MIX.map(([k, col]) => {
                          const n = (b as unknown as Record<string, number>)[k];
                          return (
                            <td key={k} className="tnum px-3 py-2.5 text-right font-medium" style={{ color: n ? col : "var(--text-muted)", opacity: n ? 1 : 0.5 }}>{n}</td>
                          );
                        })}
                        <td className="px-3 py-2.5 text-right"><span className="tnum inline-block min-w-[2.2rem] rounded-full px-2 py-0.5 text-center font-semibold text-white" style={{ background: "linear-gradient(135deg, #2b4fc0, #06b6d4)" }}>{b.total}</span></td>
                        <td className="tnum px-3 py-2.5 text-right font-medium" style={{ color: b.won ? "#16a34a" : "var(--text-muted)" }} title="Won leads are part of Stages">{b.won}</td>
                        <td className="tnum px-3 py-2.5 text-right">{b.agentId ? formatMinutes(b.avgFirstResponseMinutes) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-border px-5 pb-4 pt-2 text-[12px] text-muted">Calls + WhatsApp + Notes + Viewings + Stages + Listings + Other = Total. Won is part of Stages. Click an agent to filter the timeline to them.</p>
            </details>
          )}
        </section>
      </div>

      {/* detail drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(13,31,92,0.4)] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && setOpen(null)}>
          <aside role="dialog" aria-modal="true" aria-label="Activity details" className="h-full w-full max-w-md overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-3">
              <TypeBadge type={open.type} />
              <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-primary-soft">
                <Icon d="M6 6l12 12M18 6 6 18" size={16} />
              </button>
            </div>
            <h2 className="mt-5 text-[20px] font-semibold leading-snug">{describe(open) || typeLabel(open.type)}</h2>
            <p className="mt-1 text-[13px] text-muted">{new Date(open.createdAt).toLocaleString("en-GB", { timeZone: TZ, dateStyle: "full", timeStyle: "short" })} (Qatar time)</p>
            <dl className="mt-6 flex flex-col gap-4 text-[14px]">
              <div>
                <dt className="label-caps">Done by</dt>
                <dd className="mt-1">
                  <AgentCell r={open} />
                </dd>
              </div>
              <div>
                <dt className="label-caps">Lead</dt>
                <dd className="mt-1">
                  <LeadCell r={open} />
                  {open.leadPhone && <span className="ml-2 text-muted">{open.leadPhone}</span>}
                </dd>
              </div>
              <div>
                <dt className="label-caps">Property</dt>
                <dd className="mt-1">
                  <PropCell r={open} />
                </dd>
              </div>
              {(open.oldValue || open.newValue) && (
                <div>
                  <dt className="label-caps">Change</dt>
                  <dd className="mt-1">
                    {open.oldValue ?? "—"} → {open.newValue ?? "—"}
                  </dd>
                </div>
              )}
              {open.note && (
                <div>
                  <dt className="label-caps">Note</dt>
                  <dd className="mt-1 whitespace-pre-wrap">{open.note}</dd>
                </div>
              )}
              <div>
                <dt className="label-caps">Source</dt>
                <dd className="mt-1">{open.source ?? "—"}</dd>
              </div>
            </dl>
            <div className="mt-7 flex flex-wrap gap-2">
              {open.leadId && (
                <Link href={`/leads/${open.leadId}`} className="rounded-xl px-4 py-2.5 text-[13.5px] font-semibold text-white" style={{ background: "var(--primary)" }}>
                  Open lead
                </Link>
              )}
              {open.listingId && (
                <Link href={`/property/${open.listingId}`} className="rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-[13.5px] font-semibold hover:bg-primary-soft">
                  Open property
                </Link>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default function ActivitiesPage() {
  return (
    <Suspense fallback={null}>
      <ActivitiesInner />
    </Suspense>
  );
}
