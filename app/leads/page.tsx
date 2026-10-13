"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { IconSearch, IconGrid, IconList, IconPin, IconClose } from "@/components/desktop/icons";
import FilterSelect from "@/components/leads/FilterSelect";
import BulkBar from "@/components/leads/BulkBar";
import MobileLeads from "@/components/leads/MobileLeads";
import { AddLeadModal, ImportLeadsModal } from "@/components/leads/LeadIntake";
import { ContactButtons, SourceBadge, StageSelect } from "@/components/leads/LeadBits";
import { LeadGroupDTO, LeadRow, LeadsResponse, LeadStageDTO } from "@/components/leads/leadTypes";
import { timeAgo } from "@/lib/timeAgo";
import { agentCount as gridAgentCount, kpis, stageCount } from "@/lib/leads/counts";

interface Attention {
  overdue: { id: string; text: string; dueAt: string; lead: { id: string; name: string } }[];
  today: { id: string; text: string; dueAt: string; lead: { id: string; name: string } }[];
  waiting: { id: string; name: string; receivedAt: string; assignedTo: { name: string } | null }[];
  waitingCount: number;
}

const CHANNELS = [
  ["ALL", "All channels"],
  ["WHATSAPP", "WhatsApp"],
  ["CALL", "Calls"],
  ["EMAIL", "Email"],
  ["FORM", "Lead forms"],
] as const;

function Initial({ name }: { name: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-light text-[15px] font-semibold text-primary">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function PropertyCell({ lead }: { lead: LeadRow }) {
  if (!lead.listing && !lead.region && !lead.listingReference)
    return <span className="text-[12.5px] text-muted">{lead.entityType === "seller" ? "Seller enquiry" : lead.entityType ? `${lead.entityType} enquiry` : "General enquiry"}</span>;
  return (
    <div className="min-w-0">
      <div className="truncate text-[13.5px] font-medium">{lead.listing?.buildingName ?? lead.listingReference ?? "Listing"}</div>
      {lead.region && (
        <div className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-muted">
          <IconPin size={12} className="shrink-0" />
          <span className="truncate">{lead.region}</span>
        </div>
      )}
    </div>
  );
}

function AgentCell({ lead }: { lead: LeadRow }) {
  if (!lead.assignedTo) return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11.5px] font-semibold text-amber-800">Unassigned</span>;
  return (
    <div className="flex items-center gap-2">
      <Avatar name={lead.assignedTo.name} avatarUrl={lead.assignedTo.avatarUrl} size={24} />
      <span className="truncate text-[13px]">{lead.assignedTo.name}</span>
    </div>
  );
}

function DesktopLeads() {
  const { data: session, status } = useSession();
  const isDesktop = useIsDesktop();
  const [data, setData] = useState<LeadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignee, setAssignee] = useState("all");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number][0]>("ALL");
  const [stageFilter, setStageFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [view, setViewState] = useState<"table" | "board">("table");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [group, setGroup] = useState("all");
  const [groups, setGroups] = useState<LeadGroupDTO[]>([]);
  const [attention, setAttention] = useState<Attention | null>(null);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const [intake, setIntake] = useState<null | "add" | "import">(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("leads.view") === "board") setViewState("board");
    } catch {}
  }, []);
  function setView(v: "table" | "board") {
    setViewState(v);
    try {
      localStorage.setItem("leads.view", v);
    } catch {}
  }

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (assignee !== "all") p.set("assignee", assignee);
    if (channel !== "ALL") p.set("channel", channel);
    if (debounced) p.set("q", debounced);
    if (group !== "all") p.set("group", group);
    p.set("limit", "100");
    try {
      const [res, gRes, aRes] = await Promise.all([fetch(`/api/leads?${p.toString()}`), fetch("/api/leads/groups"), fetch("/api/leads/attention")]);
      if (res.ok) setData(await res.json());
      if (gRes.ok) setGroups((await gRes.json()).groups);
      if (aRes.ok) setAttention(await aRes.json());
    } finally {
      setLoading(false);
    }
  }, [assignee, channel, debounced, group]);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [load, status]);

  const [loadingMore, setLoadingMore] = useState(false);
  async function loadMore() {
    if (!data?.nextCursor) return;
    setLoadingMore(true);
    const p = new URLSearchParams();
    if (assignee !== "all") p.set("assignee", assignee);
    if (channel !== "ALL") p.set("channel", channel);
    if (debounced) p.set("q", debounced);
    if (group !== "all") p.set("group", group);
    p.set("limit", "100");
    p.set("cursor", data.nextCursor);
    try {
      const res = await fetch(`/api/leads?${p.toString()}`);
      if (res.ok) {
        const more: LeadsResponse = await res.json();
        setData((cur) => (cur ? { ...cur, leads: [...cur.leads, ...more.leads], nextCursor: more.nextCursor } : more));
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function moveLead(id: string, stageId: string) {
    if (!data) return;
    const prev = data;
    const moved = data.leads.find((l) => l.id === id);
    // Keep the one count grid in step, so every number on screen stays right after a move.
    const countGrid = moved && moved.stageId !== stageId
      ? data.countGrid.map((c) => (c.assignedToId === (moved.assignedTo?.id ?? null) && c.stageId === moved.stageId ? { ...c, count: c.count - 1 } : c)).concat(data.countGrid.some((c) => c.assignedToId === (moved.assignedTo?.id ?? null) && c.stageId === stageId) ? [] : [{ assignedToId: moved.assignedTo?.id ?? null, stageId, count: 0 }]).map((c) => (c.assignedToId === (moved.assignedTo?.id ?? null) && c.stageId === stageId ? { ...c, count: c.count + 1 } : c))
      : data.countGrid;
    setData({ ...data, countGrid, leads: data.leads.map((l) => (l.id === id ? { ...l, stageId } : l)) });
    const res = await fetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stageId }) });
    if (!res.ok) setData(prev);
  }

  // Download the ticked leads as a CSV file (what is on screen, with the stage and agent names).
  function exportPicked() {
    const stageName = new Map(stages.map((st) => [st.id, st.name]));
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Name", "Phone", "Email", "Source", "Channel", "Stage", "Agent", "Area", "Received"];
    const rows = visible.filter((l) => selected.has(l.id)).map((l) => [l.name, l.phone, l.email, l.sourceLabel ?? l.source, l.channel, stageName.get(l.stageId), l.assignedTo?.name ?? "Unassigned", l.region, l.receivedAt]);
    const blob = new Blob(["\ufeff" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function syncNow() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/leads/sync", { method: "POST" });
      const d = await res.json().catch(() => null);
      if (!res.ok) setSyncMsg({ ok: false, text: d?.error ?? "Sync failed" });
      else {
        setSyncMsg({ ok: true, text: d.fetched === 0 ? "Up to date. Property Finder has no leads in the last 3 months." : `Fetched ${d.fetched} leads: ${d.created} new, ${d.updated} already here.` });
        await load();
      }
    } finally {
      setSyncing(false);
    }
  }

  const stages: LeadStageDTO[] = data?.stages ?? [];
  const firstStage = stages.find((s) => s.kind === "OPEN");
  const all = useMemo(() => data?.leads ?? [], [data]);
  const visible = useMemo(() => (stageFilter === "all" ? all : all.filter((l) => l.stageId === stageFilter)), [all, stageFilter]);
  const canManage = data?.canManage ?? false;
  // Only leads still on screen count as selected, so filtering never acts on hidden ones.
  const picked = useMemo(() => visible.filter((l) => selected.has(l.id)).map((l) => l.id), [visible, selected]);
  const allPicked = visible.length > 0 && picked.length === visible.length;
  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const isAdmin = session?.user?.role === "OWNER" || session?.user?.role === "ADMIN";

  // Every number below comes from the server's one (agent x stage) grid, never from the rows on screen.
  const grid = useMemo(() => data?.countGrid ?? [], [data]);
  const sel = { assignee, stageId: stageFilter };
  const counts = kpis(grid, stages, firstStage?.id, { assignee });
  const agentCount = (id: string | null) => gridAgentCount(grid, id, sel);
  const totalAll = gridAgentCount(grid, "all", sel);

  const empty = !loading && all.length === 0;

  const filtersActive = Boolean(debounced) || channel !== "ALL" || stageFilter !== "all" || assignee !== "all" || group !== "all";
  const attentionItems = attention ? attention.overdue.length + attention.today.length + attention.waitingCount : 0;

  return (
    <div className="px-4 pb-24 lg:px-0 lg:pb-10 page-in">
      {/* Header */}
      <div className="pt-4 pb-4 lg:pt-10 lg:pb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold lg:text-[28px] lg:font-semibold lg:leading-none lg:tracking-[-0.025em]">Leads</h1>
          <p className="mt-1 text-[13px] text-muted lg:mt-2.5 lg:text-[15px]">{canManage ? "Every enquiry from Property Finder, sorted by agent." : "Enquiries sent to you from Property Finder."}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <button type="button" onClick={() => setIntake("add")} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13.5px] font-medium text-white shadow-sm" style={{ background: "var(--primary)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add lead
          </button>

          <div className="relative">
            <button type="button" onClick={() => setMoreOpen((o) => !o)} aria-haspopup="menu" aria-expanded={moreOpen} className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-[13.5px] font-medium shadow-sm transition-colors hover:bg-surface-muted">
              More
              {counts.unassigned > 0 && canManage && <span className="tnum rounded-full bg-amber-500 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-white">{counts.unassigned}</span>}
              <svg className={`transition-transform ${moreOpen ? "rotate-180" : ""}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {moreOpen && (
              <>
                <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setMoreOpen(false)} />
                <div role="menu" className="absolute right-0 top-12 z-40 w-72 overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-xl">
                  {[
                    { show: true, label: "Import leads", hint: "From a CSV or Excel file", icon: "M12 16V4M7 9l5-5 5 5M5 20h14", onClick: () => setIntake("import") },
                    { show: canManage, label: "Assignment", hint: "Give waiting leads to an agent", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M19 8v6M22 11h-6", href: "/leads/assignment", badge: counts.unassigned },
                    { show: canManage, label: "Assignment rules", hint: "Round robin or manual", icon: "M4 6h16M4 12h16M4 18h10", href: "/leads/rules" },
                    { show: isAdmin, label: "Lead stages", hint: "Add, rename or reorder stages", icon: "M5 12h14M13 6l6 6-6 6", href: "/leads/stages" },
                    { show: isAdmin, label: syncing ? "Syncing…" : "Sync from Property Finder", hint: "Fetch the latest leads now", icon: "M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5", onClick: syncNow, disabled: syncing },
                  ]
                    .filter((i) => i.show)
                    .map((i) => {
                      const inner = (
                        <>
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-light text-primary">
                            <svg className={i.disabled ? "animate-spin" : ""} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d={i.icon} />
                            </svg>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-medium">{i.label}</span>
                            <span className="block text-[12px] text-muted">{i.hint}</span>
                          </span>
                          {i.badge ? <span className="tnum rounded-full bg-amber-500 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-white">{i.badge}</span> : null}
                        </>
                      );
                      const cls = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-muted disabled:opacity-60";
                      return i.href ? (
                        <Link key={i.label} href={i.href} role="menuitem" onClick={() => setMoreOpen(false)} className={cls}>
                          {inner}
                        </Link>
                      ) : (
                        <button
                          key={i.label}
                          type="button"
                          role="menuitem"
                          disabled={i.disabled}
                          onClick={() => {
                            setMoreOpen(false);
                            i.onClick?.();
                          }}
                          className={cls}
                        >
                          {inner}
                        </button>
                      );
                    })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {flash && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-success-bg px-4 py-3 text-[13.5px]" style={{ color: "var(--success)" }}>
          <span>{flash}</span>
          <button type="button" onClick={() => setFlash(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
            <IconClose size={14} />
          </button>
        </div>
      )}

      {syncMsg && (
        <div className={`mb-4 flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-[13.5px] ${syncMsg.ok ? "bg-success-bg" : "bg-danger-bg text-danger"}`} style={syncMsg.ok ? { color: "var(--success)" } : undefined}>
          <span>{syncMsg.text}</span>
          <button type="button" onClick={() => setSyncMsg(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
            <IconClose size={14} />
          </button>
        </div>
      )}

      {/* Needs attention: one slim row; the list opens on demand and scrolls inside a small box */}
      {attention && attentionItems > 0 && (
        <div className="mb-4 overflow-hidden rounded-xl border border-warning/30 bg-warning-soft">
          <button type="button" onClick={() => setAttentionOpen((o) => !o)} aria-expanded={attentionOpen} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
            <span className="text-[13.5px] font-semibold text-amber-900">Needs attention</span>
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {attention.overdue.length > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11.5px] font-semibold text-rose-700">{attention.overdue.length} overdue</span>}
              {attention.today.length > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-[11.5px] font-semibold text-amber-800">{attention.today.length} due today</span>}
              {attention.waitingCount > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-[11.5px] font-semibold text-amber-800">{attention.waitingCount} of {counts.fresh} new not contacted</span>}
            </span>
            <span className="shrink-0 text-[12.5px] font-semibold text-amber-900">{attentionOpen ? "Hide" : "View"}</span>
            <svg className={`shrink-0 text-amber-900 transition-transform ${attentionOpen ? "rotate-180" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {attentionOpen && (
            <ul className="max-h-56 divide-y divide-amber-100 overflow-y-auto border-t border-amber-200 bg-white/60">
              {[
                ...attention.overdue.map((t) => ({ key: t.id, href: `/leads/${t.lead.id}`, name: t.lead.name, note: t.text, tag: `Overdue · ${timeAgo(t.dueAt)}`, tone: "bg-rose-100 text-rose-700" })),
                ...attention.today.map((t) => ({ key: t.id, href: `/leads/${t.lead.id}`, name: t.lead.name, note: t.text, tag: `Today ${new Date(t.dueAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })}`, tone: "bg-amber-100 text-amber-800" })),
                ...attention.waiting.map((l) => ({ key: l.id, href: `/leads/${l.id}`, name: l.name, note: l.assignedTo ? l.assignedTo.name : "Unassigned", tag: timeAgo(l.receivedAt), tone: "bg-amber-100 text-amber-800" })),
              ].map((r) => (
                <li key={r.key}>
                  <Link href={r.href} className="flex items-center justify-between gap-3 px-4 py-2 text-[13px] transition-colors hover:bg-amber-50">
                    <span className="min-w-0 truncate">
                      <b className="font-semibold">{r.name}</b> <span className="text-muted">· {r.note}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.tone}`}>{r.tag}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="kpi-row grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[
          { label: "New", value: counts.fresh, hint: "Waiting to be contacted", tone: "var(--primary)" },
          { label: "In progress", value: counts.open, hint: "Open leads", tone: "var(--primary)" },
          { label: "Won", value: counts.won, hint: "Converted", tone: "var(--success)" },
          canManage ? { label: "Unassigned", value: counts.unassigned, hint: "Need an agent", tone: "var(--warning)" } : { label: "Total", value: counts.total, hint: "Your leads", tone: "var(--muted)" },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-surface shadow-sm px-4 py-3.5 lg:p-5">
            <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: t.tone }} />
              {t.label}
            </div>
            <div className="kpi-num tnum mt-1.5 text-[26px] font-bold leading-none tracking-tight lg:mt-2 lg:text-[30px]">{loading ? <span className="inline-block h-6 w-8 animate-pulse rounded bg-surface-muted" /> : t.value}</div>
            <div className="mt-1.5 text-[12px] text-muted lg:mt-2">{t.hint}</div>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex min-w-[180px] flex-1 items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 shadow-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-accent-light">
          <IconSearch size={16} className="shrink-0 text-muted" />
          <input data-bare value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, email or area" className="min-w-0 flex-1 bg-transparent py-3 text-[14.5px] outline-none" />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-muted hover:text-foreground">
              <IconClose size={13} />
            </button>
          )}
        </div>
        <div className={`grid w-full gap-2 sm:contents ${canManage ? "grid-cols-3" : "grid-cols-2"}`}>
        {canManage && data && (
          <FilterSelect
            label="Filter by agent"
            value={assignee}
            onChange={setAssignee}
            allValue="all"
            searchable
            searchPlaceholder="Search agents…"
            options={[
              { value: "all", label: "All agents", count: totalAll },
              { value: "unassigned", label: "Unassigned", count: agentCount(null) },
              ...data.agents.map((a) => ({ value: a.id, label: a.name, count: agentCount(a.id), avatar: { name: a.name, avatarUrl: a.avatarUrl } })),
            ]}
          />
        )}
        {(!isDesktop || view === "table") && stages.length > 0 && (
          <FilterSelect
            label="Filter by lead stage"
            value={stageFilter}
            onChange={setStageFilter}
            allValue="all"
            width={200}
            options={[{ value: "all", label: "All stages", count: stageCount(grid, "all", { assignee }) }, ...stages.map((s) => ({ value: s.id, label: s.name, color: s.color, count: stageCount(grid, s.id, { assignee }) }))]}
          />
        )}
        <FilterSelect label="Filter by channel" value={channel} onChange={(v) => setChannel(v as (typeof CHANNELS)[number][0])} allValue="ALL" width={170} options={CHANNELS.map(([v, l]) => ({ value: v, label: l }))} />
        </div>
        {isDesktop && (
          <div className="flex shrink-0 rounded-lg border border-border bg-surface p-0.5 shadow-sm" role="group" aria-label="Layout">
            {([["table", IconList, "Table view"], ["board", IconGrid, "Board view"]] as const).map(([v, Icon, label]) => (
              <button key={v} type="button" onClick={() => setView(v)} aria-label={label} aria-pressed={view === v} className={`flex h-9 w-10 items-center justify-center rounded-md transition-colors ${view === v ? "bg-slate-100 text-slate-900" : "text-muted hover:text-foreground"}`}>
                <Icon size={16} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Group chips */}
      {groups.length > 0 && (
        <div className="no-scrollbar mt-3 flex items-center gap-1.5 overflow-x-auto">
          <span className="shrink-0 text-[12px] font-medium text-muted">Groups</span>
          {[{ id: "all", name: "All", color: null as string | null, count: null as number | null }, ...groups.map((g) => ({ ...g, count: (g as { count?: number | null }).count ?? null }))].map((g) => {
            const on = group === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setGroup(g.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${on ? "text-white" : "bg-surface-muted text-slate-600 hover:bg-border"}`}
                style={on ? { background: g.color ?? "var(--primary-dark)" } : undefined}
              >
                {g.name}
                {g.count !== null && <span className={`tnum text-[11px] ${on ? "text-white/75" : "text-muted"}`}>{g.count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div className="mt-5">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-2xl border border-border bg-surface" />
            ))}
          </div>
        ) : empty && !filtersActive ? (
          <div className="rounded-2xl border border-border bg-surface shadow-sm px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-light text-primary">
              <IconSearch size={24} />
            </div>
            <p className="text-[17px] font-semibold">No leads yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-[14px] text-muted">
              {isAdmin
                ? "New Property Finder enquiries appear here the moment they arrive. To load the last 3 months now, press Sync. If it asks for permission, your Property Finder API key needs the Leads scope."
                : "When someone enquires about one of your listings on Property Finder, it will show up here."}
            </p>
            {isAdmin && (
              <button type="button" onClick={syncNow} disabled={syncing} className="mt-5 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--primary)" }}>
                {syncing ? "Syncing…" : "Sync from Property Finder"}
              </button>
            )}
          </div>
        ) : visible.length === 0 && !(isDesktop && view === "board") ? (
          <div className="rounded-2xl border border-border bg-surface shadow-sm px-6 py-14 text-center text-[14px] text-muted">No leads match these filters.</div>
        ) : isDesktop && view === "board" ? (
          <div className="grid auto-cols-[300px] grid-flow-col gap-4 overflow-x-auto pb-4">
            {stages.map((s) => {
              const col = all.filter((l) => l.stageId === s.id);
              return (
                <div
                  key={s.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverStage(s.id);
                  }}
                  onDragLeave={() => setOverStage((o) => (o === s.id ? null : o))}
                  onDrop={() => {
                    if (dragId) moveLead(dragId, s.id);
                    setDragId(null);
                    setOverStage(null);
                  }}
                  className={`flex min-h-[320px] flex-col rounded-2xl p-2.5 transition-colors ${overStage === s.id ? "bg-accent-light" : "bg-slate-200/50"}`}
                >
                  <div className="mb-2.5 flex items-center justify-between px-1.5 pt-1">
                    <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                      <span className="h-2 w-2 rounded-full" style={{ background: s.color ?? "var(--text-subtle)" }} />
                      {s.name}
                    </span>
                    <span className="tnum rounded-full bg-white/80 px-2 py-0.5 text-[11.5px] font-semibold text-slate-600">{stageCount(grid, s.id, { assignee })}</span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {col.map((l) => (
                      <div
                        key={l.id}
                        draggable
                        onDragStart={() => setDragId(l.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverStage(null);
                        }}
                        className={`cursor-grab rounded-xl bg-white p-3.5 shadow-[var(--shadow-card)] transition-opacity active:cursor-grabbing ${dragId === l.id ? "opacity-40" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link href={`/leads/${l.id}`} className="block truncate text-[14px] font-semibold hover:text-primary">{l.name}</Link>
                            <div className="truncate text-[12px] text-muted">{l.phone ?? l.email ?? "No contact"}</div>
                          </div>
                          <ContactButtons lead={l} size={30} />
                        </div>
                        <div className="mt-2.5">
                          <PropertyCell lead={l} />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                          <SourceBadge lead={l} />
                          <div className="text-right text-[11.5px] text-muted">{timeAgo(l.receivedAt)}</div>
                        </div>
                        {canManage && (
                          <div className="mt-2.5">
                            <AgentCell lead={l} />
                          </div>
                        )}
                      </div>
                    ))}
                    {col.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-[12px] text-slate-400">Drop leads here</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : isDesktop ? (
          <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-surface-muted/60 text-[11.5px] font-semibold uppercase tracking-wider text-muted">
                  <th className="w-10 py-3 pl-4">
                    <input type="checkbox" aria-label="Select all leads" checked={allPicked} onChange={() => setSelected(allPicked ? new Set() : new Set(visible.map((l) => l.id)))} />
                  </th>
                  <th className="px-2.5 py-3">Name</th>
                  <th className="px-2.5 py-3">Phone</th>
                  <th className="px-2.5 py-3">Source</th>
                  {canManage && <th className="px-2.5 py-3">Assigned agent</th>}
                  <th className="px-2.5 py-3">Stage</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => (
                  <tr key={l.id} className={`border-b border-border last:border-b-0 transition-colors ${selected.has(l.id) ? "bg-accent-light/60" : "hover:bg-accent-light/40"}`}>
                    <td className="w-10 py-3.5 pl-4">
                      <input type="checkbox" aria-label={`Select ${l.name}`} checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                    </td>
                    <td className="px-2.5 py-3">
                      <Link href={`/leads/${l.id}`} className="block max-w-[190px] truncate text-[14px] font-medium hover:text-primary">{l.name}</Link>
                      {l.duplicates > 0 && <span title={`${l.duplicates} other lead${l.duplicates === 1 ? "" : "s"} with the same phone or email`} className="mt-0.5 inline-block rounded-full bg-warning-soft px-2 py-0.5 text-[10.5px] font-bold leading-none text-warning">Duplicate</span>}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-3 text-[13.5px]">{l.phone ?? <span className="text-muted">{l.email ?? "—"}</span>}</td>
                    <td className="px-2.5 py-3">
                      <SourceBadge lead={l} />
                    </td>
                    {canManage && (
                      <td className="px-2.5 py-3">
                        <AgentCell lead={l} />
                      </td>
                    )}
                    <td className="px-2.5 py-3">
                      <StageSelect lead={l} stages={stages} onChange={(sid) => moveLead(l.id, sid)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((l) => (
              <div key={l.id} className="rounded-2xl border border-border bg-surface shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Initial name={l.name} />
                    <div className="min-w-0">
                      <Link href={`/leads/${l.id}`} className="block truncate text-[15px] font-semibold">{l.name}</Link>
                      <div className="truncate text-[12.5px] text-muted">{l.phone ?? l.email ?? "No contact details"}</div>
                    </div>
                  </div>
                  <ContactButtons lead={l} size={38} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <PropertyCell lead={l} />
                  <SourceBadge lead={l} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <StageSelect lead={l} stages={stages} onChange={(sid) => moveLead(l.id, sid)} compact />
                  <div className="text-right text-[12px] text-muted">
                    <div className="font-medium text-foreground">{timeAgo(l.receivedAt)}</div>
                    {canManage && <AgentCell lead={l} />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {data?.nextCursor && !loading && (
          <div className="mt-4 flex flex-col items-center gap-1.5">
            <span className="text-[12.5px] text-muted">Showing {all.length} of {data.total}</span>
            <button type="button" onClick={loadMore} disabled={loadingMore} className="rounded-xl border border-border bg-surface px-5 py-2.5 text-[13.5px] font-medium shadow-sm transition-colors hover:bg-surface-muted disabled:opacity-60">
              {loadingMore ? "Loading..." : "Load more leads"}
            </button>
          </div>
        )}
        {isDesktop && view === "table" && picked.length > 0 && (
          <BulkBar
            selected={picked}
            onExport={exportPicked}
            onClear={() => setSelected(new Set())}
            onDone={(m) => {
              setFlash(m);
              setSelected(new Set());
              load();
            }}
            canManage={canManage}
            isAdmin={isAdmin}
            stages={stages}
            agents={data?.agents ?? []}
            groups={groups}
          />
        )}
        {data && data.total > all.length && <p className="mt-4 text-center text-[12.5px] text-muted">Showing the latest {all.length} of {data.total} leads. Use search or the filters to narrow down.</p>}
      </div>
      {intake === "add" && (
        <AddLeadModal
          onClose={() => setIntake(null)}
          canManage={canManage}
          agents={data?.agents ?? []}
          onDone={(m) => {
            setIntake(null);
            setFlash(m);
            load();
          }}
        />
      )}
      {intake === "import" && (
        <ImportLeadsModal
          onClose={() => setIntake(null)}
          canManage={canManage}
          agents={data?.agents ?? []}
          stages={stages}
          onDone={(m) => {
            setIntake(null);
            setFlash(m);
            load();
          }}
        />
      )}
    </div>
  );
}

// Phones get their own, simpler list (components/leads/MobileLeads.tsx); laptops keep the table.
// Nothing renders until the screen size is known, so a laptop never loads the phone list first.
export default function LeadsPage() {
  const isDesktop = useIsDesktop();
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  if (!ready) return null;
  return isDesktop ? <DesktopLeads /> : <MobileLeads />;
}
