"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const timeOnly = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

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
  leaderboard: { agentId: string | null; name: string; calls: number; whatsapp: number; notes: number; viewings: number; stages: number; won: number; total: number; avgFirstResponseMinutes: number | null }[];
  perDay: { day: string; n: number }[];
  meta: { agents: { id: string; name: string; avatarUrl: string | null }[]; stages: string[]; canSeeAll: boolean };
}

// ---------- small building blocks ----------
function Icon({ d, size = 15 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function TypeBadge({ type }: { type: string }) {
  const info = TYPE_INFO.get(type);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] font-medium text-text-body">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-text-muted shadow-[0_2px_8px_rgba(13,31,92,0.08)]">
        <Icon d={info?.icon ?? "M12 5v14"} size={14} />
      </span>
      {typeLabel(type)}
    </span>
  );
}

interface Option {
  value: string;
  label: string;
  group?: string;
  avatar?: { name: string; avatarUrl: string | null };
}

// A multi-select dropdown: a button showing what is chosen, a searchable list with check marks.
function MultiPick({ label, options, value, onChange, width = 260 }: { label: string; options: Option[]; value: string[]; onChange: (v: string[]) => void; width?: number }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = [...new Set(shown.map((o) => o.group ?? ""))];
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} className={`flex h-11 items-center gap-2 rounded-xl border bg-surface-elevated px-3.5 text-[13.5px] font-medium shadow-sm transition-colors ${value.length ? "border-primary text-primary" : "border-border text-text-body"}`}>
        {label}
        {value.length > 0 && <span className="tnum rounded-full bg-primary px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-white">{value.length}</span>}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div role="listbox" aria-multiselectable className="glass absolute left-0 top-12 z-40 overflow-hidden rounded-2xl border border-border shadow-[0_18px_50px_-12px_rgba(13,31,92,0.25)]" style={{ width }}>
          {options.length > 8 && (
            <div className="border-b border-border p-2">
              <input data-bare autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} className="w-full rounded-lg bg-surface-muted px-3 py-2 text-[13.5px] outline-none" />
            </div>
          )}
          <div className="max-h-72 overflow-y-auto p-1.5">
            {shown.length === 0 && <p className="px-3 py-4 text-center text-[13px] text-muted">Nothing found</p>}
            {groups.map((g) => (
              <div key={g}>
                {g && <div className="label-caps px-3 pb-1 pt-2.5">{g}</div>}
                {shown
                  .filter((o) => (o.group ?? "") === g)
                  .map((o) => {
                    const on = value.includes(o.value);
                    return (
                      <button key={o.value} type="button" role="option" aria-selected={on} onClick={() => toggle(o.value)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] hover:bg-primary-soft">
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-primary bg-primary text-white" : "border-slate-300 bg-white"}`}>{on && <Icon d="M5 12.5l4.5 4.5L19 7.5" size={11} />}</span>
                        {o.avatar && <Avatar name={o.avatar.name} avatarUrl={o.avatar.avatarUrl} size={22} />}
                        <span className="truncate">{o.label}</span>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="w-full border-t border-border py-2.5 text-[12.5px] font-semibold text-primary hover:bg-primary-soft">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const Kpi = ({ label, value }: { label: string; value: number | string }) => (
  <div className="rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm lg:p-5">
    <div className="text-[12.5px] font-medium text-muted">{label}</div>
    <div className="kpi-num tnum mt-1.5 text-[26px] font-bold leading-none tracking-tight lg:mt-2 lg:text-[30px]">{value}</div>
  </div>
);

// Activities per day: quiet blue-grey bars; today (or the day being looked at) is the accent.
function DayBars({ data, from, to, highlight }: { data: { day: string; n: number }[]; from: string; to: string; highlight: string }) {
  const days: string[] = [];
  for (let d = from, i = 0; d <= to && i < 120; d = shift(d, 1), i++) days.push(d);
  const map = new Map(data.map((x) => [x.day, x.n]));
  const max = Math.max(1, ...days.map((d) => map.get(d) ?? 0));
  return (
    <div>
      <div className="flex h-24 items-end gap-[3px]" role="img" aria-label="Activities per day">
        {days.map((d) => {
          const n = map.get(d) ?? 0;
          return <div key={d} title={`${dayLabel(d)}: ${n}`} className="min-w-[3px] flex-1 rounded-t" style={{ height: `${Math.max(n ? 6 : 2, (n / max) * 100)}%`, background: d === highlight ? "var(--primary)" : "#d5dbea" }} />;
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted">
        <span>{dayLabel(days[0] ?? from)}</span>
        <span>{dayLabel(days[days.length - 1] ?? to)}</span>
      </div>
    </div>
  );
}

// ---------- the page ----------
function ActivitiesInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { data: session, status } = useSession();

  // Phones and small tablets use Properties instead (this page is for 768px and up).
  useEffect(() => {
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches) router.replace("/");
  }, [router]);

  // The URL is the source of truth for every filter, so a filtered view can be bookmarked or shared.
  const range = sp.get("range") ?? (sp.get("from") || sp.get("to") ? "custom" : "7d");
  const resolved = range === "custom" ? { from: sp.get("from") ?? shift(today(), -6), to: sp.get("to") ?? today() } : presetRange(range);
  const agents = useMemo(() => (sp.get("agents") ?? "").split(",").filter(Boolean), [sp]);
  const types = useMemo(() => (sp.get("types") ?? "").split(",").filter(Boolean), [sp]);
  const sources = useMemo(() => (sp.get("sources") ?? "").split(",").filter(Boolean), [sp]);
  const stage = sp.get("stage") ?? "";
  const property = sp.get("property") ?? "";
  const lead = sp.get("lead") ?? "";
  const view = sp.get("view") === "timeline" ? "timeline" : "table";

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
  const [customOpen, setCustomOpen] = useState(range === "custom");

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
  const typeOptions: Option[] = ACTIVITY_TYPES.map((t) => ({ value: t.type, label: t.label, group: t.group }));
  const sourceOptions: Option[] = SOURCE_FILTERS.map((s) => ({ value: s.key, label: s.label }));
  const agentAvatar = useMemo(() => new Map((summary?.meta.agents ?? []).map((a) => [a.id, a])), [summary]);

  const filtersActive = agents.length + types.length + sources.length > 0 || Boolean(stage || property || lead) || range !== "7d";
  const chips: { label: string; clear: () => void }[] = [
    ...(range === "custom" ? [{ label: `${dayLabel(resolved.from)} – ${dayLabel(resolved.to)}`, clear: () => set({ range: null, from: null, to: null }) }] : range !== "7d" ? [{ label: PRESETS.find((p) => p.key === range)?.label ?? range, clear: () => set({ range: null, from: null, to: null }) }] : []),
    ...agents.map((a) => ({ label: a === "system" ? "System" : agentOptions.find((o) => o.value === a)?.label ?? "Agent", clear: () => set({ agents: agents.filter((x) => x !== a).join(",") || null }) })),
    ...types.map((t) => ({ label: typeLabel(t), clear: () => set({ types: types.filter((x) => x !== t).join(",") || null }) })),
    ...(stage ? [{ label: `Stage: ${stage}`, clear: () => set({ stage: null }) }] : []),
    ...sources.map((s) => ({ label: SOURCE_FILTERS.find((x) => x.key === s)?.label ?? s, clear: () => set({ sources: sources.filter((x) => x !== s).join(",") || null }) })),
    ...(property ? [{ label: `Property: ${property}`, clear: () => set({ property: null }) }] : []),
    ...(lead ? [{ label: `Lead: ${lead}`, clear: () => set({ lead: null }) }] : []),
  ];
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

  return (
    <div className="page-in pb-12">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6 pt-10">
        <div>
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">Activities</h1>
          <p className="mt-2.5 text-[15px] text-muted">{manager ? "Everything your team did: leads, listings and users." : "Everything you did: leads, listings and your account."}</p>
        </div>
        <a href={`/api/activities/export?${apiQs}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface-elevated px-4 text-[13.5px] font-semibold shadow-sm transition-colors hover:bg-primary-soft">
          <Icon d="M12 3v12M7 10l5 5 5-5M5 21h14" />
          Export CSV
        </a>
      </div>

      {/* filters */}
      <div className="glass sticky top-0 z-30 -mx-2 mb-4 rounded-2xl px-2 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex rounded-xl border border-border bg-surface-elevated p-1 shadow-sm" role="group" aria-label="Date range">
            {PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => { setCustomOpen(false); set({ range: p.key === "7d" ? null : p.key, from: null, to: null }); }} aria-pressed={range === p.key} className={`whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${range === p.key ? "bg-primary-soft text-primary" : "text-muted hover:text-foreground"}`}>
                {p.label}
              </button>
            ))}
            <button type="button" onClick={() => { setCustomOpen((o) => !o); if (range !== "custom") set({ range: "custom", from: resolved.from, to: resolved.to }); }} aria-pressed={range === "custom"} className={`whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${range === "custom" ? "bg-primary-soft text-primary" : "text-muted hover:text-foreground"}`}>
              Custom
            </button>
          </div>
          {customOpen && (
            <div className="flex items-center gap-2">
              <input type="date" aria-label="From" value={resolved.from} max={resolved.to} onChange={(e) => e.target.value && set({ range: "custom", from: e.target.value, to: resolved.to })} className={`${input} w-[150px]`} />
              <span className="text-muted">to</span>
              <input type="date" aria-label="To" value={resolved.to} min={resolved.from} max={today()} onChange={(e) => e.target.value && set({ range: "custom", from: resolved.from, to: e.target.value })} className={`${input} w-[150px]`} />
            </div>
          )}
          {manager && <MultiPick label="Agent" options={agentOptions} value={agents} onChange={(v) => set({ agents: v.join(",") || null })} />}
          <MultiPick label="Activity type" options={typeOptions} value={types} onChange={(v) => set({ types: v.join(",") || null })} width={280} />
          <select aria-label="Stage" value={stage} onChange={(e) => set({ stage: e.target.value || null })} className="h-11 rounded-xl border border-border bg-surface-elevated px-3 text-[13.5px] font-medium shadow-sm">
            <option value="">Any stage</option>
            {(summary?.meta.stages ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <MultiPick label="Source" options={sourceOptions} value={sources} onChange={(v) => set({ sources: v.join(",") || null })} width={220} />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <div className="min-w-[200px] flex-1">
            <input value={propertyDraft} onChange={(e) => setPropertyDraft(e.target.value)} placeholder="Property: listing ID or building" aria-label="Search property" className={input} />
          </div>
          <div className="min-w-[200px] flex-1">
            <input value={leadDraft} onChange={(e) => setLeadDraft(e.target.value)} placeholder="Lead: name or phone" aria-label="Search lead" className={input} />
          </div>
          {filtersActive && (
            <button type="button" onClick={clearAll} className="h-11 rounded-xl px-4 text-[13.5px] font-semibold text-primary hover:bg-primary-soft">
              Clear all
            </button>
          )}
        </div>
        {chips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Active filters">
            {chips.map((c, i) => (
              <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft py-1 pl-3 pr-1.5 text-[12.5px] font-medium text-primary">
                {c.label}
                <button type="button" onClick={c.clear} aria-label={`Remove ${c.label}`} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/70">
                  <Icon d="M6 6l12 12M18 6 6 18" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {error && <div className="mb-4 rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>}

      {/* summary */}
      <div className="kpi-row grid grid-cols-6 gap-3 lg:gap-4 max-[1100px]:grid-cols-3">
        {summary
          ? [
              ["Total activities", summary.kpis.total],
              ["Calls", summary.kpis.calls],
              ["WhatsApp messages", summary.kpis.whatsapp],
              ["Viewings", summary.kpis.viewings],
              ["Stage changes", summary.kpis.stages],
              ["Listings published", summary.kpis.published],
            ].map(([l, v]) => <Kpi key={l as string} label={l as string} value={(v as number).toLocaleString()} />)
          : [1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-[92px] animate-pulse rounded-2xl" />)}
      </div>

      {summary && (
        <div className="mt-5 grid gap-4">
          {manager && (
            <section className="surface-card overflow-hidden">
              <h2 className="label-caps px-5 pt-5">Agent leaderboard</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-[13.5px]">
                  <thead>
                    <tr>
                      {th("name", "Agent", "text-left")}
                      {th("calls", "Calls")}
                      {th("whatsapp", "WhatsApp")}
                      {th("notes", "Notes")}
                      {th("viewings", "Viewings")}
                      {th("stages", "Stages")}
                      {th("won", "Won")}
                      {th("avgFirstResponseMinutes", "Avg 1st reply")}
                      {th("total", "Total")}
                    </tr>
                  </thead>
                  <tbody>
                    {board.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-5 py-8 text-center text-muted">
                          No activity in this range.
                        </td>
                      </tr>
                    )}
                    {board.map((b) => (
                      <tr key={b.agentId ?? "system"} className={`cursor-pointer border-t border-border ${agents.length === 1 && agents[0] === (b.agentId ?? "system") ? "is-selected" : ""}`} onClick={() => set({ agents: b.agentId ?? "system" })}>
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium text-text">{b.name}</td>
                        <td className="tnum px-3 py-2.5 text-right">{b.calls}</td>
                        <td className="tnum px-3 py-2.5 text-right">{b.whatsapp}</td>
                        <td className="tnum px-3 py-2.5 text-right">{b.notes}</td>
                        <td className="tnum px-3 py-2.5 text-right">{b.viewings}</td>
                        <td className="tnum px-3 py-2.5 text-right">{b.stages}</td>
                        <td className="tnum px-3 py-2.5 text-right">{b.won}</td>
                        <td className="tnum px-3 py-2.5 text-right">{formatMinutes(b.avgFirstResponseMinutes)}</td>
                        <td className="tnum px-3 py-2.5 text-right font-semibold text-primary-dark">{b.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-5 pb-4 pt-2 text-[12px] text-muted">Click an agent to filter the page to them.</p>
            </section>
          )}
          <section className="surface-card p-5">
            <h2 className="label-caps">Activities per day</h2>
            <div className="mt-4">
              <DayBars data={summary.perDay} from={resolved.from} to={resolved.to} highlight={today()} />
            </div>
          </section>
        </div>
      )}

      {/* list */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold">
          {loading ? "Loading…" : `${total.toLocaleString()} ${total === 1 ? "activity" : "activities"}`}
        </h2>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={() => setSortDate((s) => (s === "newest" ? "oldest" : "newest"))} className="h-10 rounded-xl border border-border bg-surface-elevated px-3.5 text-[13px] font-medium shadow-sm">
            Date: {sortDate === "newest" ? "newest first ↓" : "oldest first ↑"}
          </button>
          <div className="flex rounded-xl border border-border bg-surface-elevated p-1 shadow-sm" role="group" aria-label="Layout">
            {(["table", "timeline"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => set({ view: v === "table" ? null : v })} className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium capitalize ${view === v ? "bg-primary-soft text-primary" : "text-muted"}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3">
        {loading && rows.length === 0 ? (
          <div className="space-y-2.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="surface-card px-6 py-16 text-center">
            <p className="text-[17px] font-semibold">No activities for these filters</p>
            <p className="mt-1.5 text-[14px] text-muted">Try a wider date range or remove a filter.</p>
            {filtersActive && (
              <button type="button" onClick={clearAll} className="mt-5 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white" style={{ background: "var(--primary)" }}>
                Clear filters
              </button>
            )}
          </div>
        ) : view === "table" ? (
          <div className="surface-card overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead>
                <tr>
                  {["Date & time", "Agent", "Type", "Lead", "Property", "Details", "Source"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} tabIndex={0} onClick={() => setOpen(r)} onKeyDown={(e) => e.key === "Enter" && setOpen(r)} className="cursor-pointer border-t border-border">
                    <td className="tnum whitespace-nowrap px-4 py-3 text-muted">{when(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      <AgentCell r={r} />
                    </td>
                    <td className="px-4 py-3">
                      <TypeBadge type={r.type} />
                    </td>
                    <td className="max-w-[140px] truncate px-4 py-3">
                      <LeadCell r={r} />
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-3">
                      <PropCell r={r} />
                    </td>
                    <td className="max-w-[210px] truncate px-4 py-3 text-text-body">{describe(r) || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{r.source ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {grouped.map((g) => (
              <section key={g.day}>
                <h3 className="label-caps mb-2.5 !text-[11.5px]">{g.label}</h3>
                <ul className="surface-card divide-y divide-border">
                  {g.items.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => setOpen(r)} className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-surface">
                        <span className="tnum w-[70px] shrink-0 text-[12.5px] text-muted">{timeOnly(r.createdAt)}</span>
                        <TypeBadge type={r.type} />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] text-text-body">
                          <b className="font-semibold text-text">{r.leadName ?? (r.listingName ? `${listingCode(r.listingId!)} ${r.listingName}` : "")}</b>
                          {describe(r) ? ` · ${describe(r)}` : ""}
                        </span>
                        <span className="shrink-0 text-[12.5px] text-muted">{who(r)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        {rows.length < total && (
          <div className="mt-5 flex flex-col items-center gap-1.5">
            <span className="text-[12.5px] text-muted">
              Showing {rows.length.toLocaleString()} of {total.toLocaleString()}
            </span>
            <button type="button" onClick={loadMore} disabled={more} className="rounded-xl border border-border bg-surface-elevated px-5 py-2.5 text-[13.5px] font-medium shadow-sm hover:bg-primary-soft disabled:opacity-60">
              {more ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
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
