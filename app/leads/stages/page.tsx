"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { IconChevronLeft } from "@/components/desktop/icons";

interface Stage {
  id: string;
  name: string;
  kind: "OPEN" | "WON" | "LOST";
  color: string | null;
  leads: number;
}
interface Data {
  max: number;
  colors: string[];
  stages: Stage[];
}

const KIND_LABEL = { OPEN: "In progress", WON: "Won", LOST: "Lost" } as const;
const KIND_HELP = { OPEN: "A lead still being worked", WON: "A lead that became a deal", LOST: "A lead that didn't work out" } as const;
const card = "rounded-2xl border border-border bg-surface shadow-sm";

export default function LeadStagesPage() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "OWNER" || session?.user?.role === "ADMIN";
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Stage["kind"]>("OPEN");
  const [color, setColor] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [paletteFor, setPaletteFor] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Stage | null>(null);
  const [moveTo, setMoveTo] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/leads/stages");
    if (res.status === 403) return setDenied(true);
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    if (status === "authenticated") load();
  }, [status, load]);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg({ ok: false, text: d?.error ?? "That didn't work" });
        return null;
      }
      return d ?? {};
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const d = await call("/api/leads/stages", "POST", { name, kind, color: color || data?.colors[0] });
    if (d) {
      setName("");
      setMsg({ ok: true, text: "Stage added." });
      await load();
    }
  }
  async function rename() {
    if (!editing) return;
    const e = editing;
    setEditing(null);
    const cur = data?.stages.find((s) => s.id === e.id);
    if (cur && cur.name !== e.name.trim()) {
      await call(`/api/leads/stages/${e.id}`, "PATCH", { name: e.name });
      await load();
    }
  }
  async function patch(id: string, body: Record<string, unknown>) {
    if (await call(`/api/leads/stages/${id}`, "PATCH", body)) await load();
  }
  async function remove() {
    if (!removing) return;
    const d = await call(`/api/leads/stages/${removing.id}${removing.leads > 0 ? `?moveTo=${moveTo}` : ""}`, "DELETE");
    if (d) {
      setMsg({ ok: true, text: removing.leads > 0 ? `Stage deleted. ${removing.leads} lead${removing.leads === 1 ? "" : "s"} moved.` : "Stage deleted." });
      setRemoving(null);
      await load();
    }
  }

  if (status === "loading") return null;
  if (denied || (status === "authenticated" && !isAdmin))
    return (
      <div className="px-4 py-20 text-center text-muted">
        <p>Only admins can manage lead stages.</p>
        <Link href="/leads" className="font-medium" style={{ color: "var(--primary)" }}>
          Back to Leads
        </Link>
      </div>
    );

  const stages = data?.stages ?? [];
  const full = stages.length >= (data?.max ?? 15);
  const swatches = data?.colors ?? [];
  const chosen = color || swatches[0];
  const group = (k: Stage["kind"]) => stages.filter((s) => s.kind === k);

  return (
    <div className="px-4 pb-24 lg:px-0 lg:pb-12 page-in">
      <div className="pt-4 lg:pt-8">
        <div className="mb-4 flex items-center gap-2 text-[13px] text-muted">
          <Link href="/leads" className="inline-flex items-center gap-1 font-medium transition-colors hover:text-slate-900">
            <IconChevronLeft size={15} />
            Leads
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-medium text-slate-700">Stages</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
          <div>
            <h1 className="text-xl font-bold lg:text-[28px] lg:font-semibold lg:leading-none lg:tracking-[-0.025em]">Lead stages</h1>
            <p className="mt-1 text-[13px] text-muted lg:mt-2.5 lg:text-[15px]">The steps a lead moves through, from new to won or lost.</p>
          </div>
          <span className={`tnum rounded-full px-3.5 py-1.5 text-[13px] font-medium ${full ? "bg-amber-100 text-amber-800" : "bg-surface-muted text-slate-600"}`}>
            {stages.length} of {data?.max ?? 15} stages
          </span>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-[13.5px] ${msg.ok ? "bg-success-bg" : "bg-danger-bg text-danger"}`} style={msg.ok ? { color: "var(--success)" } : undefined}>
          {msg.text}
        </div>
      )}

      {/* Add */}
      <section className={`${card} p-5 lg:p-6`}>
        <h2 className="text-[16px] font-medium">Add a stage</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-[12px] text-muted">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && !full && add()} maxLength={30} placeholder="e.g. Documents sent" disabled={full} className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:border-primary disabled:opacity-60" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-muted">Type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as Stage["kind"])} disabled={full} className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14px] outline-none disabled:opacity-60">
              {(Object.keys(KIND_LABEL) as Stage["kind"][]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={add} disabled={busy || full || !name.trim()} className="rounded-xl px-6 py-2.5 text-[14px] font-medium text-white disabled:opacity-50" style={{ background: "var(--primary)" }}>
            Add stage
          </button>
        </div>
        <div className="mt-4">
          <label className="mb-1.5 block text-[12px] text-muted">Colour</label>
          <div className="flex flex-wrap gap-2">
            {swatches.map((c) => (
              <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={chosen === c} onClick={() => setColor(c)} disabled={full} className={`h-7 w-7 rounded-full transition-transform hover:scale-110 disabled:opacity-50 ${chosen === c ? "ring-2 ring-offset-2" : ""}`} style={{ background: c, ["--tw-ring-color" as string]: c }} />
            ))}
          </div>
        </div>
        {full && <p className="mt-3 text-[13px] text-amber-800">You have reached the limit of {data?.max} stages. Delete one to add another.</p>}
      </section>

      {/* List */}
      <div className="mt-6 flex flex-col gap-6">
        {(["OPEN", "WON", "LOST"] as const).map((k) => {
          const rows = group(k);
          if (!data || rows.length === 0) return null;
          return (
            <section key={k}>
              <div className="mb-2 flex items-baseline gap-2 px-1">
                <h2 className="text-[14px] font-medium">{KIND_LABEL[k]}</h2>
                <span className="text-[12.5px] text-muted">{KIND_HELP[k]}</span>
              </div>
              <ul className={`${card} divide-y divide-border`}>
                {rows.map((s, i) => (
                  <li key={s.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex shrink-0 flex-col">
                        <button type="button" aria-label="Move up" disabled={busy || i === 0} onClick={() => patch(s.id, { direction: "up" })} className="px-1 text-[10px] leading-none text-slate-500 hover:text-slate-900 disabled:opacity-25">
                          ▲
                        </button>
                        <button type="button" aria-label="Move down" disabled={busy || i === rows.length - 1} onClick={() => patch(s.id, { direction: "down" })} className="px-1 text-[10px] leading-none text-slate-500 hover:text-slate-900 disabled:opacity-25">
                          ▼
                        </button>
                      </div>
                      <button type="button" aria-label="Change colour" onClick={() => setPaletteFor(paletteFor === s.id ? null : s.id)} className="h-5 w-5 shrink-0 rounded-full ring-offset-2 transition-transform hover:scale-110 focus-visible:ring-2" style={{ background: s.color ?? "var(--primary)" }} />
                      {editing?.id === s.id ? (
                        <input autoFocus value={editing.name} maxLength={30} onChange={(e) => setEditing({ id: s.id, name: e.target.value })} onBlur={rename} onKeyDown={(e) => (e.key === "Enter" ? rename() : e.key === "Escape" && setEditing(null))} className="min-w-0 flex-1 rounded-lg border border-primary bg-surface px-2.5 py-1.5 text-[14.5px] outline-none" />
                      ) : (
                        <button type="button" onClick={() => setEditing({ id: s.id, name: s.name })} title="Click to rename" className="min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-left text-[14.5px] hover:bg-surface-muted">
                          {s.name}
                        </button>
                      )}
                      <span className="tnum shrink-0 text-[13px] text-muted">
                        {s.leads} lead{s.leads === 1 ? "" : "s"}
                      </span>
                      <button type="button" onClick={() => { setRemoving(s); setMoveTo(stages.find((o) => o.id !== s.id && o.kind === s.kind)?.id ?? stages.find((o) => o.id !== s.id)?.id ?? ""); }} className="shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-danger hover:bg-danger-bg">
                        Delete
                      </button>
                    </div>
                    {paletteFor === s.id && (
                      <div className="mt-3 flex flex-wrap gap-2 pl-[52px]">
                        {swatches.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={`Colour ${c}`}
                            onClick={() => {
                              setPaletteFor(null);
                              patch(s.id, { color: c });
                            }}
                            className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${s.color === c ? "ring-2 ring-offset-2" : ""}`}
                            style={{ background: c, ["--tw-ring-color" as string]: c }}
                          />
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {removing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(13,31,92,0.4)] backdrop-blur-[2px] lg:items-center lg:p-6" onMouseDown={(e) => e.target === e.currentTarget && setRemoving(null)}>
          <div role="dialog" className="w-full rounded-t-3xl bg-surface p-5 shadow-2xl lg:max-w-md lg:rounded-3xl lg:p-6">
            <h2 className="text-[19px] font-medium">Delete &ldquo;{removing.name}&rdquo;?</h2>
            {removing.leads > 0 ? (
              <>
                <p className="mt-1.5 text-[13.5px] text-muted">
                  {removing.leads} lead{removing.leads === 1 ? " is" : "s are"} in this stage. Choose where {removing.leads === 1 ? "it" : "they"} should go.
                </p>
                <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="mt-4 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14px] outline-none">
                  {stages
                    .filter((o) => o.id !== removing.id)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </>
            ) : (
              <p className="mt-1.5 text-[13.5px] text-muted">No leads are in this stage.</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setRemoving(null)} className="rounded-xl px-5 py-2.5 text-[13.5px] text-slate-600 hover:bg-surface-muted">
                Cancel
              </button>
              <button type="button" disabled={busy || (removing.leads > 0 && !moveTo)} onClick={remove} className="rounded-xl bg-rose-600 px-5 py-2.5 text-[13.5px] font-medium text-white hover:bg-rose-700 disabled:opacity-50">
                {busy ? "Deleting…" : "Delete stage"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
