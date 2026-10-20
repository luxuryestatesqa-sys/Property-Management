"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Avatar from "@/components/Avatar";
import { useConfirm } from "@/components/ConfirmDialog";
import { extractErrorMessage } from "@/lib/errors";
import type { TeamDetail, TeamMemberStats } from "@/lib/teamStats";

const COLORS = ["#2b4fc0", "#16a34a", "#8b5cf6", "#f59e0b", "#0891b2", "#e11d48"];
const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

function Bars({ title, rows, empty }: { title: string; rows: { id: string; name: string; value: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="surface-card p-5">
      <h2 className="label-caps !text-[11px]">{title}</h2>
      <ul className="mt-4 flex flex-col gap-3">
        {rows.every((r) => r.value === 0) && <li className="py-4 text-center text-[13px] text-muted">{empty}</li>}
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center gap-3 text-[13px]">
            <span className="w-28 shrink-0 truncate sm:w-36">{r.name}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <span className="block h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: COLORS[i % COLORS.length] }} />
            </span>
            <span className="tnum w-10 shrink-0 text-right font-semibold">{r.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const confirm = useConfirm();
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/teams/${id}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) return setError(extractErrorMessage(data?.error, "Couldn't open this team"));
    setError("");
    setDetail(data);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function remove(m: TeamMemberStats) {
    if (!detail) return;
    const ok = await confirm({ title: `Remove ${m.name}?`, message: `${m.name} leaves ${detail.team.name}. Their leads and listings stay with them; this team's manager just stops seeing them.`, confirmLabel: "Remove from team", danger: true });
    if (!ok) return;
    setBusyId(m.id);
    try {
      const res = await fetch(`/api/teams/${id}/members?userId=${m.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) return alert(extractErrorMessage(data?.error, "Couldn't remove them"));
      setNotice(`${m.name} was removed from the team.`);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const leadRows = useMemo(() => (detail?.members ?? []).map((m) => ({ id: m.id, name: m.name, value: m.leads.total })).sort((a, b) => b.value - a.value), [detail]);
  const listingRows = useMemo(() => (detail?.members ?? []).map((m) => ({ id: m.id, name: m.name, value: m.listings.active })).sort((a, b) => b.value - a.value), [detail]);

  if (error)
    return (
      <div className="px-4 pt-10 lg:px-0">
        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-[14px] text-muted">{error}</p>
        <p className="mt-4 text-center">
          <Link href="/teams" className="text-[14px] font-semibold text-primary">
            Back to teams
          </Link>
        </p>
      </div>
    );

  const t = detail?.totals;
  const kpis = detail
    ? [
        { label: "People", value: detail.totals.people, hint: detail.totals.activePeople === detail.totals.people ? "All active" : `${detail.totals.activePeople} active`, accent: "#2b4fc0" },
        { label: "Active listings", value: detail.totals.listings.active, hint: `${detail.totals.listings.total} in total · ${detail.totals.listings.rent} rent · ${detail.totals.listings.sale} sale`, accent: "#16a34a" },
        { label: "Leads", value: detail.totals.leads.total, hint: `${detail.totals.leads.open} still open`, accent: "#8b5cf6" },
        { label: "Won", value: detail.totals.leads.won, hint: `${pct(detail.totals.leads.won, detail.totals.leads.total)}% of all leads`, accent: "#0891b2" },
        { label: "New leads, 30 days", value: detail.totals.leads.new30, hint: "Received in the last month", accent: "#f59e0b" },
        { label: "Viewings this week", value: detail.totals.viewingsWeek, hint: "Scheduled, next 7 days", accent: "#e11d48" },
      ]
    : [];

  return (
    <div className="px-4 pb-24 lg:px-0 lg:pb-10 page-in">
      <div className="pt-4 lg:pt-8">
        <Link href="/teams" className="text-[13px] font-medium text-muted hover:text-primary">
          ← Teams
        </Link>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4 pt-2 lg:pb-7">
        <div>
          <h1 className="text-xl font-bold lg:text-[28px] lg:leading-none lg:tracking-[-0.025em]">{detail?.team.name ?? "Team"}</h1>
          <p className="mt-1 text-[13px] text-muted lg:mt-2.5 lg:text-[15px]">{detail ? (detail.team.manager ? <>Managed by <strong className="font-medium text-foreground">{detail.team.manager.name}</strong></> : "No manager yet") : " "}</p>
        </div>
        {detail?.canEdit && (
          <button type="button" onClick={() => setAdding(true)} className="rounded-xl px-5 py-3 text-[14px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90" style={{ background: "var(--primary)" }}>
            + Add people
          </button>
        )}
      </div>
      {notice && <div className="mb-4 rounded-xl bg-[var(--success-bg)] px-4 py-3 text-[13.5px] text-[var(--success)]">{notice}</div>}

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-6" aria-label="Team totals">
        {(detail ? kpis : Array.from({ length: 6 }, (_, n) => ({ label: `s${n}`, value: 0, hint: "", accent: "#d5dbea" }))).map((k, i) => (
          <div key={k.label} className="relative block overflow-hidden rounded-2xl border border-border bg-surface px-4 py-4 shadow-sm">
            <span className="absolute inset-x-0 top-0 h-1" style={{ background: k.accent }} />
            {detail ? (
              <>
                <div className="text-[12.5px] font-medium text-muted">{k.label}</div>
                <div className="tnum mt-2 text-[28px] font-bold leading-none tracking-tight" style={{ color: k.accent }}>
                  {k.value.toLocaleString()}
                </div>
                <div className="mt-2 truncate text-[12px] text-muted">{k.hint}</div>
              </>
            ) : (
              <div className="h-[72px] animate-pulse rounded-lg" style={{ opacity: 1 - i * 0.1 }} />
            )}
          </div>
        ))}
      </div>

      {detail && (
        <>
          <div className="mt-4 grid gap-4 lg:mt-5 lg:grid-cols-2">
            <Bars title="Leads by person" rows={leadRows} empty="No leads in this team yet." />
            <Bars title="Active listings by person" rows={listingRows} empty="No listings in this team yet." />
          </div>

          <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(20,24,31,.04)] lg:mt-5">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="label-caps !text-[11px]">People in this team</h2>
              <span className="text-[12.5px] text-muted">
                {t!.people} {t!.people === 1 ? "person" : "people"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/60 text-[11.5px] font-semibold uppercase tracking-wider text-muted">
                    <th className="px-5 py-3">Person</th>
                    <th className="px-4 py-3 text-right">Listings</th>
                    <th className="px-4 py-3 text-right">Leads</th>
                    <th className="px-4 py-3 text-right">Open</th>
                    <th className="px-4 py-3 text-right">Won</th>
                    <th className="px-4 py-3 text-right">New (30d)</th>
                    <th className="px-4 py-3 text-right">Viewings</th>
                    {detail.canEdit && <th className="w-24 px-4 py-3" aria-label="Actions" />}
                  </tr>
                </thead>
                <tbody>
                  {detail.members.map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-b-0 hover:bg-surface-muted/40" style={m.status === "INACTIVE" ? { opacity: 0.6 } : undefined}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={m.name} avatarUrl={m.avatarUrl} size={36} />
                          <div className="min-w-0">
                            <div className="truncate text-[14px] font-semibold">{m.name}</div>
                            <div className="flex items-center gap-1.5 text-[12px] text-muted">
                              {m.role === "MANAGER" ? "Manager" : "Agent"}
                              {m.isManager && <span className="rounded-full bg-accent-light px-2 py-0.5 text-[10.5px] font-semibold text-primary">Team manager</span>}
                              {m.status === "INACTIVE" && <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10.5px] font-semibold">Inactive</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="tnum px-4 py-3 text-right text-[14px]">
                        <b>{m.listings.active}</b>
                        <span className="text-muted"> / {m.listings.total}</span>
                      </td>
                      <td className="tnum px-4 py-3 text-right text-[14px] font-semibold">{m.leads.total}</td>
                      <td className="tnum px-4 py-3 text-right text-[14px]">{m.leads.open}</td>
                      <td className="tnum px-4 py-3 text-right text-[14px]">{m.leads.won}</td>
                      <td className="tnum px-4 py-3 text-right text-[14px]">{m.leads.new30}</td>
                      <td className="tnum px-4 py-3 text-right text-[14px]">{m.viewingsWeek}</td>
                      {detail.canEdit && (
                        <td className="px-4 py-3 text-right">
                          {m.inTeam ? (
                            <button type="button" disabled={busyId === m.id} onClick={() => remove(m)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-danger hover:bg-danger-bg disabled:opacity-50">
                              Remove
                            </button>
                          ) : null}
                        </td>
                      )}
                    </tr>
                  ))}
                  {detail.members.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-10 text-center text-[13.5px] text-muted">
                        No one is in this team yet.{detail.canEdit ? " Use “Add people” to put agents in it." : ""}
                      </td>
                    </tr>
                  )}
                </tbody>
                {detail.members.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-surface-muted/60 text-[13.5px] font-semibold">
                      <td className="px-5 py-3">Team total</td>
                      <td className="tnum px-4 py-3 text-right">
                        {t!.listings.active}
                        <span className="font-normal text-muted"> / {t!.listings.total}</span>
                      </td>
                      <td className="tnum px-4 py-3 text-right">{t!.leads.total}</td>
                      <td className="tnum px-4 py-3 text-right">{t!.leads.open}</td>
                      <td className="tnum px-4 py-3 text-right">{t!.leads.won}</td>
                      <td className="tnum px-4 py-3 text-right">{t!.leads.new30}</td>
                      <td className="tnum px-4 py-3 text-right">{t!.viewingsWeek}</td>
                      {detail.canEdit && <td />}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        </>
      )}

      {adding && detail && (
        <AddPeople
          teamId={id}
          teamName={detail.team.name}
          candidates={detail.candidates}
          onClose={() => setAdding(false)}
          onAdded={async (n) => {
            setAdding(false);
            setNotice(`${n} ${n === 1 ? "person was" : "people were"} added to the team.`);
            await load();
          }}
        />
      )}
    </div>
  );
}

function AddPeople({ teamId, teamName, candidates, onClose, onAdded }: { teamId: string; teamName: string; candidates: TeamDetail["candidates"]; onClose: () => void; onAdded: (n: number) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const needle = search.trim().toLowerCase();
  const shown = candidates.filter((c) => !needle || c.name.toLowerCase().includes(needle));

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/teams/${teamId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: picked }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setError(extractErrorMessage(data?.error, "Couldn't add them"));
      onAdded(data?.added ?? picked.length);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-[rgba(13,31,92,0.4)] backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Add people to the team" className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background sm:rounded-3xl">
        <div className="flex flex-col gap-4 px-5 py-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Add people to {teamName}</h2>
              <p className="mt-1 text-[13px] text-muted">Someone is in one team at a time, so adding them here moves them out of their current team.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted">
              ✕
            </button>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" aria-label="Search people" className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-primary" />
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {shown.length === 0 && <li className="px-4 py-4 text-[13px] text-muted">{candidates.length === 0 ? "Everyone who can join a team is already in this one." : "No one matches that search."}</li>}
            {shown.map((c) => {
              const on = picked.includes(c.id);
              return (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-surface-muted">
                    <input type="checkbox" className="h-4 w-4" checked={on} onChange={() => setPicked(on ? picked.filter((x) => x !== c.id) : [...picked, c.id])} />
                    <Avatar name={c.name} avatarUrl={c.avatarUrl} size={28} />
                    <span className="min-w-0 flex-1 truncate text-[14px]">
                      {c.name} <span className="text-[12px] text-muted">{c.role === "MANAGER" ? "Manager" : "Agent"}</span>
                    </span>
                    {c.team && <span className="shrink-0 text-[11.5px] text-amber-600">{on ? `moves from ${c.team}` : `in ${c.team}`}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
          {error && <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>}
          <button type="button" disabled={busy || picked.length === 0} onClick={save} className="w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80 disabled:opacity-60" style={{ background: "var(--primary)" }}>
            {busy ? "Adding…" : picked.length === 0 ? "Choose people to add" : `Add ${picked.length} ${picked.length === 1 ? "person" : "people"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
