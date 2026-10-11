"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";
import { timeAgo } from "@/lib/timeAgo";
import { CHANNEL_LABELS } from "@/components/leads/leadTypes";
import { IconChevronLeft } from "@/components/desktop/icons";

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
}
interface Data {
  unassigned: Unassigned[];
  workload: Agent[];
  audit: { id: string; text: string | null; createdAt: string; by: string | null; lead: { id: string; name: string } }[];
}

const card = "rounded-2xl border border-border bg-surface shadow-sm";

export default function AssignmentPage() {
  const { data: session, status } = useSession();
  const isManager = session?.user?.role === "OWNER" || session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/leads/assignment");
    if (res.status === 403) return setDenied(true);
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

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
      await load();
    }
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        {/* Unassigned inbox */}
        <section className={`${card} min-w-0 overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-[16px] font-semibold">Unassigned inbox</h2>
              <p className="text-[12.5px] text-muted">{data ? `${data.unassigned.length} waiting for an agent` : "Loading…"}</p>
            </div>
            {picked.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium">{picked.size} selected</span>
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
                  {data.unassigned.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-b-0 hover:bg-accent-light/40">
                      <td className="px-5 py-3.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${l.name}`}
                          checked={picked.has(l.id)}
                          onChange={() =>
                            setPicked((p) => {
                              const n = new Set(p);
                              if (n.has(l.id)) n.delete(l.id);
                              else n.add(l.id);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-3.5">
                        <Link href={`/leads/${l.id}`} className="text-[14px] font-semibold hover:text-primary">
                          {l.name}
                        </Link>
                        <div className="text-[12.5px] text-muted">
                          {l.phone ?? "No phone"} · {CHANNEL_LABELS[l.channel]}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-[13px]">
                        <div className="font-medium">{l.listing ?? l.listingReference ?? "General enquiry"}</div>
                        <div className="text-[12px] text-muted">{l.region ?? "—"}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-[13px] text-muted">{timeAgo(l.receivedAt)}</td>
                    </tr>
                  ))}
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
                    <div className="truncate text-[13.5px] font-medium">{a.name}</div>
                    <div className="text-[11.5px] text-muted">
                      {a.total} total · {a.won} won · {a.avgResponseMinutes === null ? "no response data" : `avg response ${a.avgResponseMinutes < 60 ? `${a.avgResponseMinutes} min` : `${Math.round(a.avgResponseMinutes / 60)} h`}`}
                    </div>
                  </div>
                  <span className="tnum text-[15px] font-semibold">{a.open}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full" style={{ width: `${(a.open / maxOpen) * 100}%`, background: "var(--brand-gradient, var(--primary))" }} />
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
