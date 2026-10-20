"use client";

import { can } from "@/lib/permissions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AddLeadModal, ImportLeadsModal } from "@/components/leads/LeadIntake";
import { ContactButtons, FreshBadge, FRESH_STYLE } from "@/components/leads/LeadBits";
import { CHANNEL_LABELS, isFreshLead, LeadGroupDTO, LeadRow, LeadsResponse, LeadStageDTO } from "@/components/leads/leadTypes";
import { timeAgo } from "@/lib/timeAgo";

const PAGE = 30;
// Short names so the line under the lead's name stays on one line.
const SOURCE_SHORT: Record<LeadRow["source"], string> = { PROPERTY_FINDER: "Property Finder", META: "Meta ad", MANUAL: "Added by hand", IMPORT: "Imported" };
const CHANNEL_OPTIONS = [
  ["ALL", "All channels"],
  ["WHATSAPP", "WhatsApp"],
  ["CALL", "Calls"],
  ["EMAIL", "Email"],
  ["FORM", "Lead forms"],
] as const;

interface Attention {
  overdue: { id: string; text: string; dueAt: string; lead: { id: string; name: string } }[];
  today: { id: string; text: string; dueAt: string; lead: { id: string; name: string } }[];
  waiting: { id: string; name: string; receivedAt: string; assignedTo: { name: string } | null }[];
  waitingCount: number;
  slaHours?: number;
}

const icon = (d: string, size = 18, sw = 2) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const I = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.3-4.3",
  filter: "M4 6h16M7 12h10M10 18h4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  plus: "M12 5v14M5 12h14",
  sort: "M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3",
  chevron: "m6 9 6 6 6-6",
  user: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M19 8v6M22 11h-6",
  import: "M12 16V4M7 9l5-5 5 5M5 20h14",
  stages: "M5 12h14M13 6l6 6-6 6",
  rules: "M4 6h16M4 12h16M4 18h10",
  sync: "M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5",
  close: "M6 6l12 12M18 6 6 18",
};

// Rows are one tap to open; the colours say where a lead is (stage), what it belongs to (group), and
// whether a follow-up is due.
function Chip({ children, bg, fg }: { children: React.ReactNode; bg: string; fg: string }) {
  return (
    <span className="inline-flex max-w-[160px] items-center truncate rounded-md px-2 py-0.5 text-[11.5px] font-medium" style={{ background: bg, color: fg }}>
      {children}
    </span>
  );
}

function Row({ lead, stage, canManage, now }: { lead: LeadRow; stage?: LeadStageDTO; canManage: boolean; now: number }) {
  const sc = stage?.color ?? "var(--primary)";
  const due = lead.nextFollowUp ? new Date(lead.nextFollowUp) : null;
  const overdue = due ? due.getTime() < now : false;
  const property = lead.listing?.buildingName ?? lead.listingReference ?? lead.region;
  const fresh = isFreshLead(lead, stage?.kind);
  return (
    <li className="flex items-start gap-2 pr-3" style={fresh ? FRESH_STYLE : undefined}>
      <Link href={`/leads/${lead.id}`} className="flex min-w-0 flex-1 gap-3 py-3.5 pl-4 active:bg-surface-muted">
        <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-light text-[16px] font-medium text-primary">{lead.name.trim().charAt(0).toUpperCase() || "?"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5"><span className={`truncate text-[15.5px] ${fresh ? "font-semibold" : "font-medium"}`}>{lead.name}</span>{fresh && <FreshBadge />}{lead.duplicates > 0 && <span className="shrink-0 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-bold leading-none text-warning">Duplicate</span>}</span>
            <span className="shrink-0 text-[11.5px] text-muted">{timeAgo(lead.receivedAt)}</span>
          </div>
          <div className="mt-0.5 truncate text-[13px] text-muted">
            {lead.sourceLabel && lead.sourceLabel !== "Import" ? lead.sourceLabel : lead.source === "IMPORT" ? "Unknown" : SOURCE_SHORT[lead.source]}{lead.channel !== "OTHER" ? ` · ${CHANNEL_LABELS[lead.channel]}` : ""}
            {property ? ` · ${property}` : ""}
          </div>
          {canManage && (
            <div className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-slate-600">
              {icon(I.user, 13, 2)}
              {lead.assignedTo ? <span className="truncate">Assigned to {lead.assignedTo.name}</span> : <span className="font-medium text-amber-700">Unassigned</span>}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {stage && (
              <Chip bg={`color-mix(in srgb, ${sc} 14%, white)`} fg={`color-mix(in srgb, ${sc} 72%, black)`}>
                {stage.name}
              </Chip>
            )}
            {lead.groups?.map((g) => (
              <Chip key={g.id} bg={g.color ?? "var(--primary)"} fg="var(--surface-elevated)">
                {g.name}
              </Chip>
            ))}
            {due && (
              <Chip bg={overdue ? "var(--danger-soft)" : "var(--warning-soft)"} fg={overdue ? "var(--danger)" : "var(--warning)"}>
                {overdue ? "Follow-up overdue" : `Follow-up ${due.toLocaleDateString("en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "short" })}`}
              </Chip>
            )}
          </div>
        </div>
      </Link>
      <div className="pt-3.5">
        <ContactButtons lead={lead} size={36} />
      </div>
    </li>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-muted">{label}</span>
      <span className="relative block">
        <select value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-full appearance-none rounded-xl border border-border bg-surface pl-3.5 pr-10 text-[15px] outline-none focus:border-primary">
          {children}
        </select>
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">{icon(I.chevron, 15, 2.4)}</span>
      </span>
    </label>
  );
}

// The phone version of the Leads page: a plain list that keeps loading as you scroll, with the
// filters tucked behind one button.
export default function MobileLeads() {
  const { data: session, status } = useSession();
  const canStages = can(session?.user, "leads.stages");
  const canSync = can(session?.user, "settings.integrations");

  const [now] = useState(() => Date.now());
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tab, setTab] = useState<"all" | "new" | "unassigned" | "today" | "overdue">("all");
  const [assignee, setAssignee] = useState("all");
  const [stageId, setStageId] = useState("all");
  const [channel, setChannel] = useState("ALL");
  const [group, setGroup] = useState("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  const [items, setItems] = useState<LeadRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<{ stages: LeadStageDTO[]; agents: LeadsResponse["agents"]; canManage: boolean; unassigned: number; followups: { today: number; overdue: number } } | null>(null);
  const [groups, setGroups] = useState<LeadGroupDTO[]>([]);
  const [attention, setAttention] = useState<Attention | null>(null);
  const [attentionOpen, setAttentionOpen] = useState(false);

  const [sheet, setSheet] = useState<"filters" | "more" | null>(null);
  const [intake, setIntake] = useState<null | "add" | "import">(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const stages = useMemo(() => meta?.stages ?? [], [meta]);
  const canManage = meta?.canManage ?? false;
  const firstStage = stages.find((s) => s.kind === "OPEN");
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  // What is asked of the server: the tab can narrow things further than the filter sheet.
  const effAssignee = tab === "unassigned" ? "unassigned" : assignee;
  const effStage = tab === "new" ? firstStage?.id ?? "all" : stageId;
  const params = useMemo(() => {
    const p = new URLSearchParams({ limit: String(PAGE), sort: sort === "oldest" ? "oldest" : "newest" });
    if (effAssignee !== "all") p.set("assignee", effAssignee);
    if (effStage !== "all") p.set("stage", effStage);
    if (channel !== "ALL") p.set("channel", channel);
    if (group !== "all") p.set("group", group);
    if (debounced) p.set("q", debounced);
    if (tab === "today" || tab === "overdue") p.set("followup", tab);
    return p.toString();
  }, [effAssignee, effStage, channel, group, debounced, sort, tab]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // Each new search/filter starts a fresh list; an answer to an older one is ignored.
  const ticket = useRef(0);
  const loadFirst = useCallback(async () => {
    const mine = ++ticket.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/leads?${params}`);
      if (!res.ok) throw new Error();
      const d: LeadsResponse = await res.json();
      if (mine !== ticket.current) return;
      setItems(d.leads);
      setNext(d.nextCursor ?? null);
      setTotal(d.total);
      setMeta({ stages: d.stages, agents: d.agents, canManage: d.canManage, unassigned: d.agentCounts.find((c) => c.assignedToId === null)?.count ?? 0, followups: d.followups });
    } catch {
      if (mine === ticket.current) setError("Couldn't load leads. Pull down to try again.");
    } finally {
      if (mine === ticket.current) setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    if (status === "authenticated") loadFirst();
  }, [status, loadFirst]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/leads/groups").then((r) => (r.ok ? r.json() : null)).then((d) => d && setGroups(d.groups)).catch(() => {});
    fetch("/api/leads/attention").then((r) => (r.ok ? r.json() : null)).then((d) => d && setAttention(d)).catch(() => {});
  }, [status]);

  const loadMore = useCallback(async () => {
    if (!next || loadingMore || loading) return;
    const mine = ticket.current;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/leads?${params}&cursor=${encodeURIComponent(next)}`);
      if (!res.ok) throw new Error();
      const d: LeadsResponse = await res.json();
      if (mine !== ticket.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((l) => l.id));
        return [...prev, ...d.leads.filter((l) => !seen.has(l.id))];
      });
      setNext(d.nextCursor ?? null);
    } catch {
      if (mine === ticket.current) setError("Couldn't load more. Scroll up and down to retry.");
    } finally {
      setLoadingMore(false);
    }
  }, [next, loadingMore, loading, params]);

  // Endless scrolling: when the end of the list comes near, fetch the next page.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: "500px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [next, loadMore, items.length]);

  async function syncNow() {
    setSheet(null);
    setSyncing(true);
    try {
      const res = await fetch("/api/leads/sync", { method: "POST" });
      const d = await res.json().catch(() => null);
      setFlash(res.ok ? (d.fetched === 0 ? "Up to date." : `Fetched ${d.fetched}: ${d.created} new.`) : (d?.error ?? "Sync failed"));
      if (res.ok) loadFirst();
    } finally {
      setSyncing(false);
    }
  }

  const activeFilters = [assignee !== "all", stageId !== "all", channel !== "ALL", group !== "all"].filter(Boolean).length;
  const attentionCount = attention ? attention.overdue.length + attention.today.length + attention.waitingCount : 0;
  const tabs: [typeof tab, string][] = [["all", "All"], ["new", "New"], ["today", `Due today${meta ? ` (${meta.followups.today})` : ""}`], ["overdue", `Overdue${meta ? ` (${meta.followups.overdue})` : ""}`], ...(canManage ? ([["unassigned", "Unassigned"]] as [typeof tab, string][]) : [])];
  const clearAll = () => {
    setTab("all");
    setAssignee("all");
    setStageId("all");
    setChannel("ALL");
    setGroup("all");
    setQ("");
  };
  const filtering = activeFilters > 0 || tab !== "all" || Boolean(debounced);

  const menu = [
    { show: true, label: "Import leads", hint: "From a CSV or Excel file", d: I.import, onClick: () => { setSheet(null); setIntake("import"); } },
    { show: canManage, label: "Assignment", hint: "Give waiting leads to an agent", d: I.user, href: "/leads/assignment", badge: meta?.unassigned },
    { show: canManage, label: "Assignment rules", hint: "Round robin or manual", d: I.rules, href: "/leads/rules" },
    { show: canStages, label: "Lead stages", hint: "Add, rename or reorder", d: I.stages, href: "/leads/stages" },
    { show: canSync, label: syncing ? "Syncing…" : "Sync from Property Finder", hint: "Fetch the latest leads now", d: I.sync, onClick: syncNow },
  ].filter((m) => m.show);

  return (
    <div className="pb-28 page-in">
      {/* top: title and the "more" menu */}
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <h1 className="text-[24px] font-medium tracking-[-0.02em]">Leads</h1>
        <div className="flex items-center gap-2">
        <button type="button" onClick={() => setIntake("add")} className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium text-white shadow-sm active:opacity-80" style={{ background: "var(--primary)" }}>
          {icon(I.plus, 16, 2.6)}
          Add lead
        </button>
        <button type="button" onClick={() => setSheet("more")} aria-label="More" className="relative flex h-10 w-10 items-center justify-center rounded-full bg-surface text-slate-600 shadow-sm ring-1 ring-border active:opacity-70">
          {icon(I.more, 20, 2.6)}
          {canManage && (meta?.unassigned ?? 0) > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white" />}
        </button>
        </div>
      </div>

      {/* search and filter */}
      <div className="flex gap-2.5 px-4">
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-2xl bg-surface px-3.5 shadow-sm ring-1 ring-border focus-within:ring-2 focus-within:ring-primary">
          <span className="text-muted">{icon(I.search, 18)}</span>
          <input data-bare value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, area…" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="text-muted">
              {icon(I.close, 15, 2.4)}
            </button>
          )}
        </label>
        <button type="button" onClick={() => setSheet("filters")} className={`relative flex h-12 items-center gap-2 rounded-2xl px-4 text-[14.5px] font-medium shadow-sm ring-1 active:opacity-70 ${activeFilters ? "bg-accent-light text-primary ring-primary/40" : "bg-surface text-slate-700 ring-border"}`}>
          {icon(I.filter, 18)}
          Filter
          {activeFilters > 0 && <span className="tnum flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-medium text-white">{activeFilters}</span>}
        </button>
      </div>

      {/* tabs */}
      <div className="no-scrollbar mt-3 flex gap-1 overflow-x-auto border-b border-border px-4">
        {tabs.map(([v, l]) => (
          <button key={v} type="button" onClick={() => setTab(v)} className={`-mb-px shrink-0 border-b-2 px-3.5 pb-2.5 pt-1.5 text-[14.5px] transition-colors ${tab === v ? "border-primary font-medium text-primary" : "border-transparent text-slate-500"}`}>
            {l}
          </button>
        ))}
      </div>

      {attention && attentionCount > 0 && tab === "all" && !filtering && (
        <div className="mx-4 mt-3 overflow-hidden rounded-xl border border-warning/30 bg-warning-soft text-[13px] text-amber-900">
          {/* One tap opens the leads and follow-ups behind the number. */}
          <button type="button" onClick={() => setAttentionOpen((o) => !o)} aria-expanded={attentionOpen} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left active:opacity-70">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
            <span className="min-w-0 flex-1 truncate">
              <b className="font-medium">{attentionCount} need attention</b>
              {attention.overdue.length > 0 ? ` · ${attention.overdue.length} overdue` : ""}
              {attention.waitingCount > 0 ? ` · ${attention.waitingCount} waiting over ${attention.slaHours ?? 2}h` : ""}
            </span>
            <span className="shrink-0 text-[12.5px] font-medium">{attentionOpen ? "Hide" : "View"}</span>
            <span className={`shrink-0 transition-transform ${attentionOpen ? "rotate-180" : ""}`}>{icon(I.chevron, 15, 2.4)}</span>
          </button>
          {attentionOpen && (
            <div className="max-h-[55vh] overflow-y-auto border-t border-amber-200 bg-white/70">
              <ul className="divide-y divide-amber-100">
                {[
                  ...attention.overdue.map((t) => ({ key: `o${t.id}`, href: `/leads/${t.lead.id}`, name: t.lead.name, note: t.text, tag: `Overdue · ${timeAgo(t.dueAt)}`, tone: "bg-rose-100 text-rose-700" })),
                  ...attention.today.map((t) => ({ key: `t${t.id}`, href: `/leads/${t.lead.id}`, name: t.lead.name, note: t.text, tag: "Due today", tone: "bg-amber-100 text-amber-800" })),
                  ...attention.waiting.map((l) => ({ key: `w${l.id}`, href: `/leads/${l.id}`, name: l.name, note: l.assignedTo ? l.assignedTo.name : "Unassigned", tag: timeAgo(l.receivedAt), tone: "bg-amber-100 text-amber-800" })),
                ].map((r) => (
                  <li key={r.key}>
                    <Link href={r.href} className="flex items-center justify-between gap-3 px-3.5 py-3 active:bg-amber-50">
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium text-foreground">{r.name}</span>
                        <span className="block truncate text-[12px] text-muted">{r.note}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${r.tone}`}>{r.tag}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {attention.waitingCount > attention.waiting.length && (
                <button type="button" onClick={() => { setTab("new"); setAttentionOpen(false); }} className="w-full border-t border-amber-100 px-3.5 py-3 text-center text-[13px] font-medium text-primary active:bg-amber-50">
                  Showing {attention.waiting.length} of {attention.waitingCount} new leads not contacted for over {attention.slaHours ?? 2}h. See all in New
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* count and sort */}
      <button type="button" onClick={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))} className="mt-3 flex w-full items-center justify-between gap-3 bg-surface-muted/70 px-4 py-2.5 text-left text-[13px] text-slate-600 active:opacity-70">
        <span className="truncate">
          {total !== null ? `${total} lead${total === 1 ? "" : "s"} · ` : ""}Sorted by date received ({sort === "newest" ? "newest first" : "oldest first"})
        </span>
        <span className="shrink-0 text-muted">{icon(I.sort, 16)}</span>
      </button>

      {flash && (
        <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl bg-success-bg px-3.5 py-2.5 text-[13px]" style={{ color: "var(--success)" }}>
          <span>{flash}</span>
          <button type="button" onClick={() => setFlash(null)} aria-label="Dismiss">
            {icon(I.close, 14, 2.4)}
          </button>
        </div>
      )}

      {/* the list */}
      <div className="bg-surface">
        {loading ? (
          <ul className="divide-y divide-border">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="flex gap-3 px-4 py-4">
                <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-surface-muted" />
                <div className="flex-1 space-y-2.5">
                  <div className="h-3.5 w-1/2 animate-pulse rounded bg-surface-muted" />
                  <div className="h-3 w-3/4 animate-pulse rounded bg-surface-muted" />
                  <div className="h-5 w-1/3 animate-pulse rounded bg-surface-muted" />
                </div>
              </li>
            ))}
          </ul>
        ) : error && items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-[14.5px] text-danger">{error}</p>
            <button type="button" onClick={loadFirst} className="mt-4 rounded-xl bg-surface-muted px-5 py-2.5 text-[14px] font-medium">
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-[16px] font-medium">{filtering ? "No leads match" : "No leads yet"}</p>
            <p className="mx-auto mt-1.5 max-w-xs text-[13.5px] text-muted">{filtering ? "Try a different search or clear the filters." : "New enquiries from Property Finder and your ads appear here. You can also add a lead yourself."}</p>
            {filtering ? (
              <button type="button" onClick={clearAll} className="mt-5 rounded-xl bg-surface-muted px-5 py-2.5 text-[14px] font-medium">
                Clear filters
              </button>
            ) : (
              <button type="button" onClick={() => setIntake("add")} className="mt-5 rounded-xl px-5 py-2.5 text-[14px] font-medium text-white" style={{ background: "var(--primary)" }}>
                Add lead
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((l) => (
              <Row key={l.id} lead={l} stage={stageById.get(l.stageId)} canManage={canManage} now={now} />
            ))}
          </ul>
        )}
        <div ref={sentinel} className="h-1" />
        {loadingMore && <p className="py-5 text-center text-[13px] text-muted">Loading more…</p>}
        {!loading && !next && items.length > PAGE - 1 && <p className="py-6 text-center text-[12.5px] text-muted">That&apos;s everything.</p>}
        {error && items.length > 0 && <p className="py-4 text-center text-[13px] text-danger">{error}</p>}
      </div>

      {/* sheets */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end bg-[rgba(13,31,92,0.4)] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div role="dialog" className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-surface px-5 pb-8 pt-3 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
            {sheet === "filters" ? (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-[19px] font-medium">Filter leads</h2>
                  <button type="button" onClick={() => { setAssignee("all"); setStageId("all"); setChannel("ALL"); setGroup("all"); }} className="text-[13.5px] font-medium" style={{ color: "var(--primary)" }}>
                    Clear
                  </button>
                </div>
                <div className="flex flex-col gap-4">
                  {canManage && (
                    <Select label="Agent" value={assignee} onChange={setAssignee}>
                      <option value="all">All agents</option>
                      <option value="unassigned">Unassigned</option>
                      {meta?.agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  )}
                  <Select label="Stage" value={stageId} onChange={setStageId}>
                    <option value="all">All stages</option>
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <Select label="Channel" value={channel} onChange={setChannel}>
                    {CHANNEL_OPTIONS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                  {groups.length > 0 && (
                    <Select label="Group" value={group} onChange={setGroup}>
                      <option value="all">All groups</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
                <button type="button" onClick={() => setSheet(null)} className="mt-6 h-12 w-full rounded-2xl text-[15px] font-medium text-white" style={{ background: "var(--primary)" }}>
                  {total !== null ? `Show ${total} lead${total === 1 ? "" : "s"}` : "Done"}
                </button>
              </>
            ) : (
              <>
                <h2 className="mb-2 text-[19px] font-medium">More</h2>
                <ul className="flex flex-col">
                  {menu.map((m) => {
                    const inner = (
                      <>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-light text-primary">{icon(m.d, 19)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-medium">{m.label}</span>
                          <span className="block text-[12.5px] text-muted">{m.hint}</span>
                        </span>
                        {m.badge ? <span className="tnum rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-medium text-white">{m.badge}</span> : null}
                      </>
                    );
                    const cls = "flex w-full items-center gap-3.5 rounded-xl px-1 py-3 text-left active:bg-surface-muted";
                    return (
                      <li key={m.label}>
                        {m.href ? (
                          <Link href={m.href} className={cls}>
                            {inner}
                          </Link>
                        ) : (
                          <button type="button" onClick={m.onClick} className={cls}>
                            {inner}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {intake === "add" && (
        <AddLeadModal
          onClose={() => setIntake(null)}
          canManage={canManage}
          agents={meta?.agents ?? []}
          onDone={(m) => {
            setIntake(null);
            setFlash(m);
            // A search or filter left on could hide the lead just added.
            const filtered = q || debounced || tab !== "all" || assignee !== "all" || stageId !== "all" || channel !== "ALL" || group !== "all";
            setQ("");
            setDebounced("");
            setTab("all");
            setAssignee("all");
            setStageId("all");
            setChannel("ALL");
            setGroup("all");
            if (!filtered) loadFirst();
          }}
        />
      )}
      {intake === "import" && (
        <ImportLeadsModal
          onClose={() => setIntake(null)}
          canManage={canManage}
          agents={meta?.agents ?? []}
          stages={stages}
          onDone={(m) => {
            setIntake(null);
            setFlash(m);
            loadFirst();
          }}
        />
      )}
    </div>
  );
}
