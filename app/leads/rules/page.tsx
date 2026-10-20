"use client";

import { can } from "@/lib/permissions";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";
import { IconChevronLeft } from "@/components/desktop/icons";

interface Rule {
  id: string;
  kind: "REGION" | "ROUND_ROBIN";
  agentIds: string[];
  shares: Record<string, number>;
  active: boolean;
}
interface Data {
  workload: { id: string; name: string; avatarUrl: string | null; open: number; openShared: number; today: number; week: number; won: number; total: number; avgResponseMinutes: number | null }[];
  shareable: number;
  rules: Rule[];
}

type Mode = "ROUND_ROBIN" | "MANUAL";
const card = "rounded-2xl border border-border bg-surface shadow-sm";

export default function AssignmentRulesPage() {
  const { data: session, status } = useSession();
  const isAdmin = can(session?.user, "leads.rules");
  const isManager = isAdmin || can(session?.user, "leads.assign");
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mode, setMode] = useState<Mode>("MANUAL");
  const [picked, setPicked] = useState<string[]>([]);
  const [shares, setShares] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/leads/assignment");
    if (res.status === 403) return setDenied(true);
    if (!res.ok) return;
    const d: Data = await res.json();
    setData(d);
    const rr = d.rules.find((r) => r.kind === "ROUND_ROBIN" && r.active);
    setMode(rr ? "ROUND_ROBIN" : "MANUAL");
    setPicked(rr ? rr.agentIds : []);
    setShares(rr ? rr.shares : {});
  }, []);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

  async function request(url: string, method: string, body?: unknown) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const d = await res.json().catch(() => null);
    if (!res.ok) throw new Error(d?.error ?? "That didn't work");
    return d;
  }

  // The agency has one setting, so saving replaces whatever rules existed.
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      for (const r of data?.rules ?? []) await request(`/api/leads/rules/${r.id}`, "DELETE");
      if (mode === "ROUND_ROBIN") await request("/api/leads/rules", "POST", { kind: "ROUND_ROBIN", agentIds: picked, shares });
      setMsg({ ok: true, text: mode === "ROUND_ROBIN" ? "Saved. New Facebook, Instagram and manual leads will be shared across the agents you chose." : "Saved. New Facebook, Instagram and manual leads will wait for you to assign them." });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "That didn't work" });
    } finally {
      setBusy(false);
    }
  }

  async function applyNow() {
    setBusy(true);
    setMsg(null);
    try {
      const d = await request("/api/leads/assignment", "POST", { action: "apply-rules" });
      setMsg({ ok: true, text: d.assigned === 0 ? "No waiting Facebook, Instagram or manual leads to share out." : `Shared ${d.assigned} waiting lead${d.assigned === 1 ? "" : "s"} across the agents.` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "That didn't work" });
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return null;
  if (denied || (status === "authenticated" && !isManager))
    return (
      <div className="px-4 py-20 text-center text-muted">
        <p>Only managers and admins can see assignment rules.</p>
        <Link href="/leads" className="font-semibold" style={{ color: "var(--primary)" }}>
          Back to Leads
        </Link>
      </div>
    );

  const agents = data?.workload ?? [];
  const saved = data?.rules.find((r) => r.kind === "ROUND_ROBIN" && r.active);
  const shareOf = (id: string) => Math.min(10, Math.max(1, shares[id] ?? 1));
  const sameShares = (saved?.agentIds ?? []).every((id) => (saved?.shares?.[id] ?? 1) === shareOf(id));
  // in the order they were ticked: that order breaks ties, the same way the server does
  const inRotation = picked.flatMap((id) => agents.find((a) => a.id === id) ?? []);
  const nextUp = [...inRotation].sort((x, y) => x.openShared / shareOf(x.id) - y.openShared / shareOf(y.id) || shareOf(y.id) - shareOf(x.id))[0]?.id;
  const totalShare = inRotation.reduce((n, a) => n + shareOf(a.id), 0);
  const dirty = mode === "ROUND_ROBIN" ? !saved || [...picked].sort().join() !== [...saved.agentIds].sort().join() || !sameShares : Boolean(data?.rules.length);

  const options: { id: Mode; title: string; text: string }[] = [
    { id: "ROUND_ROBIN", title: "Round robin", text: "Each new lead goes to the ticked agent with the least open work for their share, so the work is shared fairly." },
    { id: "MANUAL", title: "Manual", text: "New leads wait in the Unassigned inbox until you hand them to an agent yourself." },
  ];

  return (
    <div className="px-4 pb-24 lg:px-0 lg:pb-12 page-in">
      <div className="pt-4 lg:pt-8">
        <div className="mb-4 flex items-center gap-2 text-[13px] text-muted">
          <Link href="/leads/assignment" className="inline-flex items-center gap-1 font-medium transition-colors hover:text-slate-900">
            <IconChevronLeft size={15} />
            Assignment
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-medium text-slate-700">Rules</span>
        </div>
        <div className="pb-6">
          <h1 className="text-xl font-bold lg:text-[28px] lg:font-semibold lg:leading-none lg:tracking-[-0.025em]">Assignment rules</h1>
          <p className="mt-1 text-[13px] text-muted lg:mt-2.5 lg:text-[15px]">How new Facebook, Instagram and manually added leads are given out. Property Finder leads always go to the owner of the listing.</p>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-[13.5px] ${msg.ok ? "bg-success-bg" : "bg-danger-bg text-danger"}`} style={msg.ok ? { color: "var(--success)" } : undefined}>
          {msg.text}
        </div>
      )}

      <section className={`${card} p-5 lg:p-6`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((o) => {
            const on = mode === o.id;
            return (
              <button key={o.id} type="button" disabled={!isAdmin} onClick={() => setMode(o.id)} aria-pressed={on} className={`rounded-2xl border-2 p-4 text-left transition-colors disabled:cursor-default ${on ? "border-primary bg-accent-light/60" : "border-border bg-surface hover:bg-surface-muted"}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${on ? "border-primary" : "border-slate-300"}`}>{on && <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--primary)" }} />}</span>
                  <span className="text-[15px] font-semibold">{o.title}</span>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{o.text}</p>
              </button>
            );
          })}
        </div>

        {mode === "ROUND_ROBIN" && (
          <div className="mt-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: "In rotation", value: picked.length, hint: "agents" },
                { label: "Waiting to share", value: data?.shareable ?? 0, hint: "Facebook, Instagram, manual" },
                { label: "Open leads", value: inRotation.reduce((n, a) => n + a.openShared, 0), hint: "Facebook, Instagram, manual" },
                { label: "Received today", value: inRotation.reduce((n, a) => n + a.today, 0), hint: "by these agents" },
              ].map((t) => (
                <div key={t.label} className="rounded-xl bg-slate-50 px-4 py-3">
                  <div className="text-[12px] font-medium text-muted">{t.label}</div>
                  <div className="tnum mt-1 text-[22px] font-semibold leading-none">{t.value}</div>
                  <div className="mt-1 text-[11.5px] text-muted">{t.hint}</div>
                </div>
              ))}
            </div>

            {picked.length === 0 && (
              <div role="alert" className="mt-5 rounded-xl px-4 py-3 text-[13.5px] font-medium" style={{ background: "#fef3c7", color: "#92400e" }}>
                No agents in the rotation — new leads will stay unassigned. Tick at least one agent, or choose Manual.
              </div>
            )}
            <div className="mt-5 flex items-baseline justify-between">
              <div className="text-[13.5px] font-semibold">Agents in the rotation</div>
              <div className="text-[12px] text-muted">Tick the agents who should receive leads</div>
            </div>
            <div className="mt-2.5 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[860px] table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-12" />
                  <col className="w-[260px]" />
                  <col className="w-[190px]" />
                  <col className="w-[70px]" />
                  <col className="w-[70px]" />
                  <col className="w-[80px]" />
                  <col className="w-[70px]" />
                  <col className="w-[100px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border bg-surface-muted/60 text-[11.5px] font-semibold uppercase tracking-wider text-muted">
                    <th className="w-10 px-4 py-2.5" />
                    <th className="px-3 py-2.5">Agent</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-center">Share of leads</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Open</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Today</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">7 days</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Won</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right">Avg reply</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => {
                    const on = picked.includes(a.id);
                    return (
                      <tr key={a.id} className={`border-b border-border last:border-b-0 ${on ? "" : "opacity-60"}`}>
                        <td className="px-4 py-3">
                          <input type="checkbox" aria-label={`Include ${a.name}`} checked={on} disabled={!isAdmin} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== a.id) : [...p, a.id]))} />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={a.name} avatarUrl={a.avatarUrl} size={28} />
                            <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[14px] font-medium" title={a.name}>{a.name}</span>
                            {/* the badge's space is always reserved, so ticking an agent never moves the row */}
                            <span className={`shrink-0 whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ${nextUp === a.id ? "" : "invisible"}`} aria-hidden={nextUp !== a.id}>Next lead</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {on ? (
                            <div className="mx-auto flex w-fit items-center gap-2">
                              <div className="flex items-center overflow-hidden rounded-lg border border-border">
                                <button type="button" aria-label={`Fewer leads for ${a.name}`} disabled={!isAdmin || shareOf(a.id) <= 1} onClick={() => setShares((p) => ({ ...p, [a.id]: shareOf(a.id) - 1 }))} className="h-8 w-8 text-[16px] text-slate-600 hover:bg-surface-muted disabled:opacity-30">
                                  −
                                </button>
                                <span className="tnum w-8 text-center text-[14px] font-semibold">{shareOf(a.id)}</span>
                                <button type="button" aria-label={`More leads for ${a.name}`} disabled={!isAdmin || shareOf(a.id) >= 10} onClick={() => setShares((p) => ({ ...p, [a.id]: shareOf(a.id) + 1 }))} className="h-8 w-8 text-[16px] text-slate-600 hover:bg-surface-muted disabled:opacity-30">
                                  +
                                </button>
                              </div>
                              <span className="tnum w-10 text-[12px] text-muted">{totalShare ? Math.round((shareOf(a.id) / totalShare) * 100) : 0}%</span>
                            </div>
                          ) : (
                            <span className="block text-center text-muted">—</span>
                          )}
                        </td>
                        <td className="tnum px-3 py-3 text-right text-[14px] font-semibold" title={`${a.open} open in total, including Property Finder`}>{a.openShared}</td>
                        <td className="tnum px-3 py-3 text-right text-[14px]">{a.today}</td>
                        <td className="tnum px-3 py-3 text-right text-[14px]">{a.week}</td>
                        <td className="tnum px-3 py-3 text-right text-[14px]">{a.won}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right text-[13px] text-muted">{a.avgResponseMinutes === null ? "—" : a.avgResponseMinutes < 60 ? `${a.avgResponseMinutes} min` : `${Math.round(a.avgResponseMinutes / 60)} h`}</td>
                      </tr>
                    );
                  })}
                  {data && agents.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-[13px] text-muted">
                        No active agents.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
              <b>Open</b> is Facebook, Instagram and manual leads still being worked (not Won or Lost). Property Finder leads are left out because they always go to the listing&apos;s owner. <b>Share of leads</b> sets how much each agent gets: an agent with share 3 gets about three times as many leads as an agent with share 1. Each new lead goes to the ticked agent with the least open work for their share, so someone who closes leads quickly gets more.
            </p>
          </div>
        )}

        {isAdmin ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            {saved ? (
              <button type="button" onClick={applyNow} disabled={busy || dirty} className="rounded-xl border border-border bg-surface px-4 py-2.5 text-[13.5px] font-semibold shadow-sm transition-colors hover:bg-surface-muted disabled:opacity-50">
                Share out waiting leads now
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={save} disabled={busy || !dirty || (mode === "ROUND_ROBIN" && picked.length === 0)} className="rounded-xl px-6 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--primary)" }}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        ) : (
          <p className="mt-5 border-t border-border pt-4 text-[13px] text-muted">Only an admin can change this.</p>
        )}
      </section>
    </div>
  );
}
