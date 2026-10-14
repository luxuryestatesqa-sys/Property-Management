"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { formatMinutes } from "@/lib/dashboardStats";
import { listingCode } from "@/lib/format";

interface Slice {
  label: string;
  count: number;
}
interface Dashboard {
  newLeads: { thisWeek: number; lastWeek: number };
  unassigned: number;
  perAgent: { id: string | null; name: string; count: number }[];
  conversion: { rate: number; won: number; total: number };
  avgFirstResponseMinutes: number | null;
  portals: { portal: "PROPERTY_FINDER" | "QATAR_LIVING" | "PROPERTY_ORYX"; published: number; errors: number; notPublished: number }[];
  activeListings: number;
  topListings: { id: number; name: string; community: string; enquiries: number }[];
  viewings: { id: string; scheduledAt: string; lead: { id: string; name: string }; listing: { id: number; buildingName: string } | null; agent: { name: string } | null }[];
  leases: { id: number; name: string; community: string; leaseEndDate: string; daysLeft: number }[];
  leadsDaily: { day: string; count: number }[];
  leadSources: Slice[];
  funnel: { name: string; kind: "OPEN" | "WON" | "LOST"; count: number }[];
  totalLeads: number;
  listingMix: { type: Slice[]; availability: Slice[]; category: Slice[] };
  tasks: { overdue: number; today: number };
  viewingsWeek: number;
  agents: { id: string; name: string }[];
}

interface Filters {
  days: 7 | 30 | 90;
  agent: string;
  type: "" | "SALE" | "RENT";
  source: string;
}
const DEFAULT_FILTERS: Filters = { days: 30, agent: "", type: "", source: "" };
const SOURCES = [
  ["PROPERTY_FINDER", "Property Finder"],
  ["META", "Meta ads"],
  ["MANUAL", "Manual"],
  ["IMPORT", "Import"],
] as const;

const WIDGETS = [
  ["kpis", "Key numbers"],
  ["trend", "New leads chart"],
  ["sources", "Lead sources"],
  ["pipeline", "Pipeline"],
  ["agents", "Leads per agent"],
  ["mix", "Sale / availability / types"],
  ["portals", "Listings per portal"],
  ["top", "Top listings"],
  ["viewings", "Upcoming viewings"],
  ["leases", "Leases ending soon"],
  ["features", "All features"],
] as const;
type WidgetId = (typeof WIDGETS)[number][0];


const PORTAL_LABELS = { PROPERTY_FINDER: "Property Finder", QATAR_LIVING: "Qatar Living", PROPERTY_ORYX: "Property Oryx" } as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Qatar", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

// One palette for every chart, so the same colour never means two things on a screen.
const PALETTE = ["#2b4fc0", "#06b6d4", "#f59e0b", "#8b5cf6", "#16a34a", "#f43f5e", "#ec4899", "#14b8a6"];
const color = (i: number) => PALETTE[i % PALETTE.length];
const AVAILABILITY_COLORS: Record<string, string> = { Available: "#16a34a", Reserved: "#f59e0b", Rented: "#2b4fc0", Sold: "#8b5cf6" };

const Card = ({ title, hint, children, className = "" }: { title: string; hint?: string; children: React.ReactNode; className?: string }) => (
  <section className={`surface-card p-5 ${className}`}>
    <h2 className="label-caps !text-[11px]">{title}</h2>
    {hint && <p className="mt-1 text-[12.5px] text-muted">{hint}</p>}
    <div className="mt-4">{children}</div>
  </section>
);

const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-6 text-center text-[13px] text-muted">{children}</p>;

// ---- charts (plain SVG, no library) ----

function AreaChart({ points }: { points: { day: string; count: number }[] }) {
  const W = 640;
  const H = 200;
  const pad = { l: 28, r: 10, t: 12, b: 24 };
  const max = Math.max(4, ...points.map((p) => p.count));
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.count).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;
  const ticks = [0, Math.round(max / 2), max];
  const [hover, setHover] = useState<number | null>(null);
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="New leads per day" onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="leadsFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2b4fc0" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="leadsLine" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#2b4fc0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="3 4" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">{t}</text>
          </g>
        ))}
        <path d={area} fill="url(#leadsFill)" />
        <path d={line} fill="none" stroke="url(#leadsLine)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <rect key={p.day} x={x(i) - (W / points.length) / 2} y={pad.t} width={W / points.length} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#2b4fc0" strokeOpacity="0.25" />
            <circle cx={x(hover)} cy={y(points[hover].count)} r="5" fill="#fff" stroke="#2b4fc0" strokeWidth="2.5" />
          </g>
        )}
        {[0, 1, 2, 3, 4].map((k) => Math.round((k / 4) * (points.length - 1))).map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--text-muted)">{label(points[i].day)}</text>
        ))}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white" style={{ background: "var(--primary-dark)" }}>
          {label(points[hover].day)} · {points[hover].count} lead{points[hover].count === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

function Donut({ slices, colors, center, centerLabel }: { slices: Slice[]; colors?: (s: Slice, i: number) => string; center?: string; centerLabel?: string }) {
  const total = slices.reduce((n, s) => n + s.count, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const col = colors ?? ((_s: Slice, i: number) => color(i));
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <svg viewBox="0 0 140 140" className="h-[132px] w-[132px] shrink-0 -rotate-90" role="img" aria-label="Breakdown chart">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--primary-soft)" strokeWidth="18" />
        {total > 0 &&
          slices.map((s, i) => {
            const len = (s.count / total) * C;
            const el = <circle key={s.label} cx="70" cy="70" r={R} fill="none" stroke={col(s, i)} strokeWidth="18" strokeDasharray={`${Math.max(0, len - 2)} ${C - Math.max(0, len - 2)}`} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
        <g className="rotate-90" style={{ transformOrigin: "70px 70px" }}>
          <text x="70" y="70" textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--primary-dark)">{center ?? total}</text>
          {centerLabel && <text x="70" y="88" textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">{centerLabel}</text>}
        </g>
      </svg>
      <ul className="flex min-w-[150px] flex-1 flex-col gap-2">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col(s, i) }} />
              <span className="text-text-body">{s.label}</span>
            </span>
            <span className="tnum shrink-0 font-semibold text-primary-dark">
              {s.count}
              <span className="ml-1 font-normal text-muted">{total ? Math.round((s.count / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; value: number; color?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-[13px]">
            <span className="truncate text-text-body">{r.label}</span>
            <span className="tnum font-semibold text-primary-dark">{r.value}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--primary-soft)" }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? `linear-gradient(90deg, ${color(i)}, ${color(i)}cc)` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Funnel({ stages }: { stages: Dashboard["funnel"] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  let openIdx = -1;
  return (
    <ul className="flex flex-col gap-2.5">
      {stages.map((s) => {
        if (s.kind === "OPEN") openIdx++;
        const c = s.kind === "WON" ? "#16a34a" : s.kind === "LOST" ? "#f43f5e" : color(openIdx);
        return (
          <li key={s.name} className="flex items-center gap-3">
            <span className="w-24 shrink-0 truncate text-[13px] text-text-body">{s.name}</span>
            <div className="h-7 flex-1 overflow-hidden rounded-lg" style={{ background: "var(--primary-soft)" }}>
              {s.count > 0 && <div className="h-full rounded-lg transition-all duration-700" style={{ width: `${Math.max(3, (s.count / max) * 100)}%`, background: `linear-gradient(90deg, ${c}, ${c}d9)` }} />}
            </div>
            <span className="tnum w-12 shrink-0 text-right text-[13px] font-semibold" style={{ color: s.count > 0 ? c : "var(--text-muted)" }}>{s.count.toLocaleString()}</span>
          </li>
        );
      })}
    </ul>
  );
}

function PortalBars({ portals, total }: { portals: Dashboard["portals"]; total: number }) {
  return (
    <ul className="flex flex-col gap-4">
      {portals.map((p) => (
        <li key={p.portal}>
          <div className="mb-1.5 flex items-center justify-between text-[13px]">
            <span className="text-text-body">{PORTAL_LABELS[p.portal]}</span>
            <span className="tnum font-semibold text-primary-dark">
              {p.published}/{total}
              {p.errors > 0 && <span className="ml-2 text-danger">{p.errors} error{p.errors === 1 ? "" : "s"}</span>}
            </span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full" style={{ background: "var(--primary-soft)" }}>
            <div style={{ width: `${total ? (p.published / total) * 100 : 0}%`, background: "#16a34a" }} />
            <div style={{ width: `${total ? (p.errors / total) * 100 : 0}%`, background: "#f43f5e" }} />
          </div>
        </li>
      ))}
      <li className="flex gap-4 text-[12px] text-muted">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: "#16a34a" }} />Published</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: "#f43f5e" }} />Error</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: "var(--primary-soft)" }} />Not published</span>
      </li>
    </ul>
  );
}

// ---- page ----

const Icon = ({ d }: { d: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const SHORTCUTS: { label: string; hint: string; href: string; color: string; icon: string }[] = [
  { label: "Properties", hint: "Search all inventory", href: "/", color: "#2b4fc0", icon: "M3 10.5L12 3l9 7.5M5 9.5V20h14V9.5" },
  { label: "My Listings", hint: "Manage your own", href: "/my-listings", color: "#06b6d4", icon: "M4 6h16M4 12h16M4 18h10" },
  { label: "Add listing", hint: "Create a property", href: "/add", color: "#16a34a", icon: "M12 5v14M5 12h14" },
  { label: "Leads", hint: "Pipeline and follow-ups", href: "/leads", color: "#f59e0b", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
  { label: "Assignment", hint: "Unassigned leads", href: "/leads/assignment", color: "#8b5cf6", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" },
  { label: "Assignment rules", hint: "Auto-route new leads", href: "/leads/rules", color: "#ec4899", icon: "M4 6h16M7 12h10M10 18h4" },
  { label: "Lead stages", hint: "Customise the pipeline", href: "/leads/stages", color: "#14b8a6", icon: "M3 3h18l-7 9v6l-4 3v-9z" },
  { label: "Activities", hint: "Everything that happened", href: "/dashboard/activities", color: "#f43f5e", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
  { label: "Team", hint: "Agents and roles", href: "/admin/users", color: "#0ea5e9", icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" },
  { label: "Settings", hint: "Portals, branding, feeds", href: "/settings", color: "#64748b", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" },
];

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [hidden, setHidden] = useState<WidgetId[]>([]);
  const [auto, setAuto] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [menu, setMenu] = useState(false);
  const loaded = useRef(false);
  const [ready, setReady] = useState(false);

  // Remember the person's filters and which widgets they hid (per browser).
  useEffect(() => {
    try {
      // Only the layout (which sections are hidden) is remembered. Filters always start cleared, so the numbers
      // on screen are never narrowed by a choice made in an earlier visit.
      const h = localStorage.getItem("dash.hidden");
      if (h) setHidden(JSON.parse(h));
      localStorage.removeItem("dash.filters");
    } catch {}
    loaded.current = true;
    setReady(true);
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem("dash.hidden", JSON.stringify(hidden));
    } catch {}
  }, [filters, hidden]);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu]);
  const show = (id: WidgetId) => !hidden.includes(id);
  const filtered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  const isManager = ["OWNER", "ADMIN", "MANAGER"].includes(session?.user?.role ?? "");

  const load = useCallback(() => {
    const qs = new URLSearchParams({ days: String(filters.days) });
    if (filters.agent) qs.set("agent", filters.agent);
    if (filters.type) qs.set("type", filters.type);
    if (filters.source) qs.set("source", filters.source);
    setRefreshing(true);
    return fetch(`/api/dashboard?${qs}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.ok) {
          setData(await r.json());
          setError("");
          setUpdatedAt(new Date());
        } else setError("Couldn't load the dashboard");
      })
      .catch(() => setError("Couldn't load the dashboard"))
      .finally(() => setRefreshing(false));
  }, [filters]);

  useEffect(() => {
    if (status === "unauthenticated") return;
    if (status === "authenticated" && !isManager) return void router.replace("/");
    if (status !== "authenticated" || !ready) return;
    void load();
  }, [status, isManager, router, load, ready]);

  // Optional live mode: refresh every minute.
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [auto, load]);

  const delta = data ? data.newLeads.thisWeek - data.newLeads.lastWeek : 0;
  const kpis = data
    ? [
        { label: "New leads this week", value: String(data.newLeads.thisWeek), hint: data.newLeads.lastWeek === 0 && data.newLeads.thisWeek === 0 ? "No leads yet" : `${delta >= 0 ? "+" : ""}${delta} vs last week`, href: "/leads", accent: "#2b4fc0" },
        { label: "Conversion rate", value: `${data.conversion.rate}%`, hint: `${data.conversion.won} won of ${data.conversion.total} (last ${filters.days} days)`, accent: "#16a34a" },
        { label: "Avg first response", value: formatMinutes(data.avgFirstResponseMinutes), hint: `Last ${filters.days} days`, accent: "#06b6d4" },
        { label: "Unassigned leads", value: String(data.unassigned), hint: filters.agent && filters.agent !== "unassigned" ? "All leads, not just this agent's" : "Needs an agent", href: "/leads/assignment", accent: "#f43f5e" },
        { label: "Active listings", value: String(data.activeListings), hint: `${data.listingMix.type.map((t) => `${t.count} ${t.label.toLowerCase()}`).join(" · ") || "No listings yet"}`, href: "/my-listings", accent: "#8b5cf6" },
        { label: "Viewings this week", value: String(data.viewingsWeek), hint: "Scheduled, next 7 days", accent: "#f59e0b" },
      ]
    : [];

  return (
    <div className="px-4 pb-24 lg:px-0 lg:pb-10 page-in">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4 pt-4 lg:pb-7 lg:pt-10">
        <div>
          <h1 className="text-xl font-bold lg:text-[28px] lg:leading-none lg:tracking-[-0.025em]">Dashboard</h1>
          <p className="mt-1 text-[13px] text-muted lg:mt-2.5 lg:text-[15px]">How the agency is doing: leads, response time, listings and what is coming up.</p>
        </div>
        {data && (data.tasks.overdue > 0 || data.tasks.today > 0) && (
          <Link href="/leads" className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-2.5 text-[13px] shadow-sm hover:border-primary">
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "#fef3c7", color: "#b45309" }}>
              <Icon d="M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0" />
            </span>
            <span>
              {data.tasks.overdue > 0 && <b className="text-danger">{data.tasks.overdue} overdue</b>}
              {data.tasks.overdue > 0 && data.tasks.today > 0 && <span className="text-muted"> · </span>}
              {data.tasks.today > 0 && <b className="text-primary-dark">{data.tasks.today} due today</b>}
              <span className="block text-[12px] text-muted">follow-up tasks</span>
            </span>
          </Link>
        )}
      </div>

      {/* Filters and controls */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-surface p-3 shadow-sm">
        <div className="flex rounded-xl p-1" style={{ background: "var(--primary-soft)" }} role="group" aria-label="Date range">
          {([7, 30, 90] as const).map((d) => (
            <button key={d} type="button" onClick={() => setFilters((f) => ({ ...f, days: d }))} aria-pressed={filters.days === d} className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${filters.days === d ? "bg-white text-primary shadow-sm" : "text-muted hover:text-text"}`}>
              {d} days
            </button>
          ))}
        </div>
        <select aria-label="Agent" value={filters.agent} onChange={(e) => setFilters((f) => ({ ...f, agent: e.target.value }))} className="rounded-xl border border-border px-3 py-2 text-[13px] outline-none">
          <option value="">All agents</option>
          <option value="unassigned">Unassigned leads</option>
          {(data?.agents ?? []).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select aria-label="Listing type" value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as Filters["type"] }))} className="rounded-xl border border-border px-3 py-2 text-[13px] outline-none">
          <option value="">Sale &amp; rent</option>
          <option value="SALE">For sale</option>
          <option value="RENT">For rent</option>
        </select>
        <select aria-label="Lead source" value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))} className="rounded-xl border border-border px-3 py-2 text-[13px] outline-none">
          <option value="">All sources</option>
          {SOURCES.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {filtered && (
          <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="rounded-xl px-3 py-2 text-[13px] font-semibold text-primary hover:bg-primary-soft">
            Reset
          </button>
        )}

        <div className="ml-auto flex items-center gap-2.5">
          {updatedAt && <span className="hidden text-[12px] text-muted xl:inline">Updated {updatedAt.toLocaleTimeString("en-GB", { timeZone: "Asia/Qatar", hour: "numeric", minute: "2-digit", hour12: true })}</span>}
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-[var(--primary)]" />
            Auto-refresh
          </label>
          <button type="button" onClick={() => void load()} disabled={refreshing} className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[13px] font-semibold hover:border-primary disabled:opacity-60">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? "animate-spin" : ""} aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
            </svg>
            Refresh
          </button>
          <div className="relative">
            <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} className="rounded-xl border border-border px-3 py-2 text-[13px] font-semibold hover:border-primary">
              Customize{hidden.length > 0 ? ` (${hidden.length} hidden)` : ""}
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-border bg-surface-elevated p-3 shadow-xl">
                  <p className="label-caps mb-2 !text-[11px]">Show on dashboard</p>
                  {WIDGETS.map(([id, label]) => (
                    <label key={id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-primary-soft">
                      <input type="checkbox" checked={show(id)} onChange={() => setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]))} className="accent-[var(--primary)]" />
                      {label}
                    </label>
                  ))}
                  {hidden.length > 0 && (
                    <button type="button" onClick={() => setHidden([])} className="mt-2 w-full rounded-lg py-1.5 text-[13px] font-semibold text-primary hover:bg-primary-soft">
                      Show everything
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>}

      {/* KPIs */}
      <div className={`stagger grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-6 ${show("kpis") ? "" : "hidden"}`}>
        {(data ? kpis : Array.from({ length: 6 }, (_, n) => ({ label: `s${n}`, value: "", hint: "", href: undefined as string | undefined, accent: "#d5dbea" }))).map((k, i) => {
          const body = data ? (
            <>
              <div className="text-[12.5px] font-medium text-muted">{k.label}</div>
              <div className="tnum mt-2 text-[28px] font-bold leading-none tracking-tight" style={{ color: k.accent }}>{k.value}</div>
              <div className="mt-2 truncate text-[12px] text-muted">{k.hint}</div>
            </>
          ) : (
            <div className="h-[72px] animate-pulse rounded-lg" style={{ opacity: 1 - i * 0.1 }} />
          );
          const cls = "relative block overflow-hidden rounded-2xl border border-border bg-surface px-4 py-4 shadow-sm";
          const bar = <span className="absolute inset-x-0 top-0 h-1" style={{ background: k.accent }} />;
          return k.href && data ? (
            <Link key={k.label} href={k.href} className={`${cls} card-hover`}>{bar}{body}</Link>
          ) : (
            <div key={k.label} className={cls}>{bar}{body}</div>
          );
        })}
      </div>

      {data && (
        <div className={refreshing ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="stagger mt-5 grid gap-4 lg:grid-cols-3 lg:gap-5">
            {show("trend") && <Card title="New leads" hint={`Per day, last ${filters.days} days`} className="lg:col-span-2">
              {data.leadsDaily.every((p) => p.count === 0) ? <Empty>No leads in the last {filters.days} days.</Empty> : <AreaChart points={data.leadsDaily} />}
            </Card>}
            {show("sources") && <Card title="Lead sources" hint={`Last ${filters.days} days`}>
              {data.leadSources.length === 0 ? <Empty>No leads yet.</Empty> : <Donut slices={data.leadSources} centerLabel="leads" />}
            </Card>}

            {show("pipeline") && <Card title="Pipeline" hint={`${data.totalLeads} leads in the last ${filters.days} days`} className="lg:col-span-2">
              {data.funnel.length === 0 ? <Empty>No pipeline stages yet.</Empty> : <Funnel stages={data.funnel} />}
            </Card>}
            {show("agents") && <Card title="Leads per agent" hint={`Received in the last ${filters.days} days`}>
              {data.perAgent.length === 0 ? <Empty>No leads in the last {filters.days} days.</Empty> : <Bars rows={data.perAgent.map((a) => ({ label: a.name, value: a.count }))} />}
            </Card>}

            {show("mix") && <Card title="Sale vs rent" hint={`${data.activeListings} active listings`}>
              {data.listingMix.type.length === 0 ? <Empty>No active listings.</Empty> : <Donut slices={data.listingMix.type} colors={(s) => (s.label === "For sale" ? "#8b5cf6" : "#06b6d4")} centerLabel="listings" />}
            </Card>}
            {show("mix") && <Card title="Availability" hint="Active listings by state">
              {data.listingMix.availability.length === 0 ? <Empty>No active listings.</Empty> : <Donut slices={data.listingMix.availability} colors={(s) => AVAILABILITY_COLORS[s.label] ?? "#64748b"} centerLabel="listings" />}
            </Card>}
            {show("mix") && <Card title="Property types" hint="Top categories">
              {data.listingMix.category.length === 0 ? <Empty>No active listings.</Empty> : <Bars rows={data.listingMix.category.map((c) => ({ label: c.label, value: c.count }))} />}
            </Card>}

            {show("portals") && <Card title="Listings per portal" hint="Published to each portal" className="lg:col-span-1">
              <PortalBars portals={data.portals} total={data.activeListings} />
            </Card>}
            {show("top") && <Card title="Top listings by enquiries" className="lg:col-span-2">
              {data.topListings.length === 0 ? <Empty>No leads are linked to a property yet.</Empty> : <Bars rows={data.topListings.map((l) => ({ label: `${listingCode(l.id)} · ${l.name}`, value: l.enquiries }))} />}
            </Card>}

            {show("viewings") && <Card title="Upcoming viewings" hint="Next 7 days" className={data.leases.length > 0 ? "" : "lg:col-span-3"}>
              {data.viewings.length === 0 ? (
                <Empty>No viewings booked.</Empty>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {data.viewings.map((v) => (
                    <li key={v.id} className="py-2.5 first:pt-0 last:pb-0">
                      <Link href={`/leads/${v.lead.id}`} className="flex items-center justify-between gap-3 text-[13.5px]">
                        <span className="min-w-0 truncate">
                          <b className="font-semibold text-text">{v.lead.name}</b>
                          <span className="text-muted">{v.listing ? ` · ${v.listing.buildingName}` : ""}{v.agent ? ` · ${v.agent.name}` : ""}</span>
                        </span>
                        <span className="tnum shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: "#fef3c7", color: "#b45309" }}>{when(v.scheduledAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>}

            {show("leases") && data.leases.length > 0 && (
              <Card title="Leases ending soon" hint="Within 60 days" className="lg:col-span-2">
                <ul className="flex flex-col divide-y divide-border">
                  {data.leases.map((l) => (
                    <li key={l.id} className="py-2.5 first:pt-0 last:pb-0">
                      <Link href={`/property/${l.id}`} className="flex items-center justify-between gap-3 text-[13.5px]">
                        <span className="min-w-0 truncate">
                          <b className="font-semibold text-text">{l.name}</b>
                          <span className="text-muted"> · {l.community}</span>
                        </span>
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={l.daysLeft <= 30 ? { background: "#fee2e2", color: "#b91c1c" } : { background: "#fef3c7", color: "#b45309" }}>
                          {l.daysLeft < 0 ? `${-l.daysLeft} d overdue` : `${l.daysLeft} d left`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          {/* Everything the app can do, one click away */}
          {show("features") && (<>
          <h2 className="label-caps mb-3 mt-8 !text-[11px]">All features</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {SHORTCUTS.map((s) => (
              <Link key={s.href} href={s.href} className="card-hover flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${s.color}1f`, color: s.color }}>
                  <Icon d={s.icon} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-text">{s.label}</span>
                  <span className="block truncate text-[12px] text-muted">{s.hint}</span>
                </span>
              </Link>
            ))}
          </div>
          </>)}
        </div>
      )}
    </div>
  );
}
