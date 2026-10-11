"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { IconSearch, IconGrid, IconList, IconPin, IconClose } from "@/components/desktop/icons";
import { ContactButtons, ReceivedAt, SourceBadge, StageSelect } from "@/components/leads/LeadBits";
import { LeadRow, LeadsResponse, LeadStageDTO } from "@/components/leads/leadTypes";
import { timeAgo } from "@/lib/timeAgo";

const CHANNELS = [
  ["ALL", "All channels"],
  ["WHATSAPP", "WhatsApp"],
  ["CALL", "Calls"],
  ["EMAIL", "Email"],
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

export default function LeadsPage() {
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
    try {
      const res = await fetch(`/api/leads?${p.toString()}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [assignee, channel, debounced]);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [load, status]);

  async function moveLead(id: string, stageId: string) {
    if (!data) return;
    const prev = data;
    setData({ ...data, leads: data.leads.map((l) => (l.id === id ? { ...l, stageId } : l)) });
    const res = await fetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stageId }) });
    if (!res.ok) setData(prev);
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
  const isAdmin = session?.user?.role === "OWNER" || session?.user?.role === "ADMIN";

  const counts = {
    fresh: all.filter((l) => l.stageId === firstStage?.id).length,
    open: all.filter((l) => stages.find((s) => s.id === l.stageId)?.kind === "OPEN").length,
    won: all.filter((l) => stages.find((s) => s.id === l.stageId)?.kind === "WON").length,
    unassigned: all.filter((l) => !l.assignedTo).length,
  };
  const agentCount = (id: string | null) => data?.agentCounts.find((c) => c.assignedToId === id)?.count ?? 0;
  const totalAll = data?.agentCounts.reduce((n, c) => n + c.count, 0) ?? 0;

  const empty = !loading && all.length === 0;

  const filtersActive = Boolean(debounced) || channel !== "ALL" || stageFilter !== "all" || assignee !== "all";

  return (
    <div className="px-4 pb-24 lg:px-0 lg:pb-10 page-in">
      {/* Header */}
      <div className="pt-4 pb-4 lg:pt-10 lg:pb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold lg:text-[28px] lg:font-semibold lg:leading-none lg:tracking-[-0.025em]">Leads</h1>
          <p className="mt-1 text-[13px] text-muted lg:mt-2.5 lg:text-[15px]">{canManage ? "Every enquiry from Property Finder, sorted by agent." : "Enquiries sent to you from Property Finder."}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
        {canManage && (
          <Link href="/leads/assignment" className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-[13.5px] font-semibold shadow-sm transition-colors hover:bg-surface-muted">
            Assignment{counts.unassigned > 0 && <span className="tnum rounded-full bg-amber-500 px-1.5 py-0.5 text-[10.5px] font-bold leading-none text-white">{counts.unassigned}</span>}
          </Link>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-[13.5px] font-semibold shadow-sm transition-colors hover:bg-surface-muted disabled:opacity-60"
          >
            <svg className={syncing ? "animate-spin" : ""} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5" />
            </svg>
            {syncing ? "Syncing…" : "Sync from Property Finder"}
          </button>
        )}
        </div>
      </div>

      {syncMsg && (
        <div className={`mb-4 flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-[13.5px] ${syncMsg.ok ? "bg-success-bg" : "bg-danger-bg text-danger"}`} style={syncMsg.ok ? { color: "var(--success)" } : undefined}>
          <span>{syncMsg.text}</span>
          <button type="button" onClick={() => setSyncMsg(null)} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
            <IconClose size={14} />
          </button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[
          { label: "New", value: counts.fresh, hint: "Waiting to be contacted", tone: "var(--primary)" },
          { label: "In progress", value: counts.open, hint: "Open leads", tone: "#0ea5e9" },
          { label: "Won", value: counts.won, hint: "Converted", tone: "var(--success)" },
          canManage ? { label: "Unassigned", value: counts.unassigned, hint: "Need an agent", tone: "#d97706" } : { label: "Total", value: all.length, hint: "Your leads", tone: "var(--muted)" },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-surface shadow-sm px-4 py-3.5 lg:p-5">
            <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: t.tone }} />
              {t.label}
            </div>
            <div className="tnum mt-1.5 text-[26px] font-semibold leading-none tracking-tight lg:mt-2 lg:text-[30px]">{loading ? <span className="inline-block h-6 w-8 animate-pulse rounded bg-surface-muted" /> : t.value}</div>
            <div className="mt-1.5 text-[12px] text-muted lg:mt-2">{t.hint}</div>
          </div>
        ))}
      </div>

      {/* Agent tabs (managers) */}
      {canManage && data && (
        <div className="no-scrollbar mt-6 flex gap-1.5 overflow-x-auto pb-1">
          {[
            { id: "all", label: "All leads", count: totalAll },
            { id: "unassigned", label: "Unassigned", count: agentCount(null) },
            ...data.agents.map((a) => ({ id: a.id, label: a.name, count: agentCount(a.id), avatar: a })),
          ].map((t) => {
            const on = assignee === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setAssignee(t.id)}
                className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors ${on ? "border-primary bg-accent-light text-primary" : "border-border bg-surface text-slate-600 hover:bg-slate-50"}`}
              >
                {"avatar" in t && t.avatar && <Avatar name={t.avatar.name} avatarUrl={t.avatar.avatarUrl} size={20} />}
                {t.label}
                <span className={`tnum rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${on ? "bg-white/70" : "bg-surface-muted text-muted"}`}>{t.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search + filters */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 shadow-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-accent-light">
          <IconSearch size={16} className="shrink-0 text-muted" />
          <input data-bare value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, email or area" className="min-w-0 flex-1 bg-transparent py-3 text-[14.5px] outline-none" />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-muted hover:text-foreground">
              <IconClose size={13} />
            </button>
          )}
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {CHANNELS.map(([v, l]) => (
            <button key={v} type="button" onClick={() => setChannel(v)} className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-2 text-[12.5px] font-medium transition-colors ${channel === v ? "border-primary bg-accent-light text-primary" : "border-border bg-surface text-slate-600 hover:bg-slate-50"}`}>
              {l}
            </button>
          ))}
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

      {/* Stage chips (table / mobile) */}
      {(!isDesktop || view === "table") && stages.length > 0 && (
        <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
          {[{ id: "all", name: "All stages", color: null as string | null }, ...stages].map((s) => {
            const n = s.id === "all" ? all.length : all.filter((l) => l.stageId === s.id).length;
            const on = stageFilter === s.id;
            return (
              <button key={s.id} type="button" onClick={() => setStageFilter(s.id)} className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${on ? "bg-slate-900 text-white" : "bg-surface-muted text-slate-600 hover:bg-border"}`}>
                {s.color && <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />}
                {s.name}
                <span className={`tnum text-[11px] ${on ? "text-white/70" : "text-muted"}`}>{n}</span>
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
                      <span className="h-2 w-2 rounded-full" style={{ background: s.color ?? "#94a3b8" }} />
                      {s.name}
                    </span>
                    <span className="tnum rounded-full bg-white/80 px-2 py-0.5 text-[11.5px] font-semibold text-slate-600">{col.length}</span>
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
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-surface-muted/60 text-[11.5px] font-semibold uppercase tracking-wider text-muted">
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Property</th>
                  <th className="px-3 py-3">Received</th>
                  <th className="px-3 py-3">Stage</th>
                  {canManage && <th className="px-3 py-3">Agent</th>}
                  <th className="px-4 py-3 text-right">Contact</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-b-0 transition-colors hover:bg-accent-light/40">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Initial name={l.name} />
                        <div className="min-w-0">
                          <Link href={`/leads/${l.id}`} className="block truncate text-[14px] font-semibold hover:text-primary">{l.name}</Link>
                          <div className="truncate text-[12.5px] text-muted">{l.phone ?? l.email ?? "No contact details"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <SourceBadge lead={l} />
                    </td>
                    <td className="max-w-[240px] px-3 py-3.5">
                      <PropertyCell lead={l} />
                    </td>
                    <td className="px-3 py-3.5">
                      <ReceivedAt iso={l.receivedAt} />
                    </td>
                    <td className="px-3 py-3.5">
                      <StageSelect lead={l} stages={stages} onChange={(sid) => moveLead(l.id, sid)} />
                    </td>
                    {canManage && (
                      <td className="px-3 py-3.5">
                        <AgentCell lead={l} />
                      </td>
                    )}
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end">
                        <ContactButtons lead={l} />
                      </div>
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
        {data && data.total > all.length && <p className="mt-4 text-center text-[12.5px] text-muted">Showing the latest {all.length} of {data.total} leads. Use search or the agent tabs to narrow down.</p>}
      </div>
    </div>
  );
}
