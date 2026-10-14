"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { IMPORT_FIELDS, ImportField, LEAD_ORIGINS, joinName, parseCsv, suggestMapping, templateCsv } from "@/lib/leads/csv";
import { LeadStageDTO } from "@/components/leads/leadTypes";

type Agent = { id: string; name: string };
type AssignMode = "self" | "rules" | "agent" | "none";
const CHANNELS = LEAD_ORIGINS.map((o) => [o.key, o.label] as const);
const MAX_ROWS = 1000;
const MAX_BYTES = 5 * 1024 * 1024;

const input = "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:border-primary";
const labelCls = "mb-1 block text-[12.5px] font-medium text-muted";
const primaryBtn = "rounded-xl px-5 py-2.5 text-[13.5px] font-medium text-white disabled:opacity-50";

function Shell({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(13,31,92,0.4)] backdrop-blur-[2px] lg:items-center lg:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={title} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-2xl lg:rounded-3xl lg:p-6 ${wide ? "lg:max-w-3xl" : "lg:max-w-lg"}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[20px] font-medium tracking-[-0.01em]">{title}</h2>
            {subtitle && <p className="mt-1 text-[13.5px] text-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-muted">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// "Who gets it?" - managers pick; an agent's own leads always stay theirs, so they don't see this.
function AssignPicker({ mode, setMode, agentId, setAgentId, agents }: { mode: AssignMode; setMode: (m: AssignMode) => void; agentId: string; setAgentId: (v: string) => void; agents: Agent[] }) {
  const opts: [AssignMode, string][] = [
    ["self", "Me"],
    ["rules", "Share by assignment rules"],
    ["agent", "A specific agent"],
    ["none", "Leave unassigned"],
  ];
  return (
    <div>
      <label className={labelCls}>Who handles it?</label>
      <div className="flex flex-wrap gap-1.5">
        {opts.map(([v, l]) => (
          <button key={v} type="button" onClick={() => setMode(v)} aria-pressed={mode === v} className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${mode === v ? "border-primary bg-accent-light text-primary" : "border-border text-slate-600 hover:bg-surface-muted"}`}>
            {l}
          </button>
        ))}
      </div>
      {mode === "agent" && (
        <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={`${input} mt-2.5`}>
          <option value="">Choose an agent…</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
export function AddLeadModal({ onClose, onDone, canManage, agents }: { onClose: () => void; onDone: (message: string, id: string) => void; canManage: boolean; agents: Agent[] }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", region: "", notes: "", channel: "OTHER" });
  const [mode, setMode] = useState<AssignMode>("self");
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dup, setDup] = useState<{ id: string; name: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function save(force = false) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, assign: { mode, agentId }, force }) });
      const d = await res.json().catch(() => null);
      if (res.status === 409 && d?.duplicate) {
        setDup(d.existing ?? { id: "", name: "" });
        return setError(d.error);
      }
      if (!res.ok) return setError(d?.error ?? "Couldn't add the lead");
      onDone("Lead added.", d.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Add a lead" subtitle="Someone who called, messaged or walked in." onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <div>
          <label className={labelCls}>Name</label>
          <input autoFocus value={f.name} onChange={set("name")} maxLength={120} className={input} placeholder="Full name" />
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Phone</label>
            <input value={f.phone} onChange={set("phone")} inputMode="tel" className={input} placeholder="e.g. +974 5550 0001" />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input value={f.email} onChange={set("email")} type="email" className={input} placeholder="name@example.com" />
          </div>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Area they are interested in</label>
            <input value={f.region} onChange={set("region")} maxLength={120} className={input} placeholder="e.g. Lusail" />
          </div>
          <div>
            <label className={labelCls}>How did they get in touch?</label>
            <select value={f.channel} onChange={set("channel")} className={input}>
              {CHANNELS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Note</label>
          <textarea value={f.notes} onChange={set("notes")} rows={3} maxLength={2000} className={`${input} resize-none`} placeholder="What they are looking for, budget…" />
        </div>
        {canManage && <AssignPicker mode={mode} setMode={setMode} agentId={agentId} setAgentId={setAgentId} agents={agents} />}

        {error && (
          <div className="rounded-xl bg-danger-bg px-4 py-3 text-[13.5px] text-danger">
            {error}
            {dup?.id && (
              <>
                {" "}
                <Link href={`/leads/${dup.id}`} className="font-medium underline">
                  Open {dup.name || "that lead"}
                </Link>
              </>
            )}
          </div>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-5 py-2.5 text-[13.5px] text-slate-600 hover:bg-surface-muted">
            Cancel
          </button>
          {dup && (
            <button type="button" disabled={busy} onClick={() => save(true)} className="rounded-xl bg-surface-muted px-5 py-2.5 text-[13.5px] font-medium hover:bg-border disabled:opacity-50">
              Add anyway
            </button>
          )}
          <button type="button" disabled={busy || (!f.phone.trim() && !f.email.trim()) || (mode === "agent" && !agentId)} onClick={() => save(false)} className={primaryBtn} style={{ background: "var(--primary)" }}>
            {busy ? "Adding…" : "Add lead"}
          </button>
        </div>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------
type Cell = string;

async function readFile(file: File): Promise<Cell[][]> {
  if (file.size > MAX_BYTES) throw new Error("That file is too large. The limit is 5 MB.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".xls")) throw new Error("Old .xls files aren't supported. Save it as .xlsx or .csv in Excel and try again.");
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    const rows = (await readSheet(file)) as unknown[][];
    return rows.map((r) => r.map((c) => (c instanceof Date ? c.toISOString() : c === null || c === undefined ? "" : String(c))));
  }
  if (/\.(csv|txt|tsv)$/.test(name)) return parseCsv(await file.text());
  throw new Error("Choose a CSV or Excel (.xlsx) file.");
}

export function ImportLeadsModal({ onClose, onDone, canManage, agents, stages }: { onClose: () => void; onDone: (message: string) => void; canManage: boolean; agents: Agent[]; stages: LeadStageDTO[] }) {
  const [step, setStep] = useState<"file" | "map" | "result">("file");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Cell[][]>([]);
  const [map, setMap] = useState<Record<ImportField, number>>({ name: -1, lastName: -1, phone: -1, email: -1, region: -1, notes: -1, date: -1 });
  const [keepExtra, setKeepExtra] = useState(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const [channel, setChannel] = useState("OTHER");
  const [mode, setMode] = useState<AssignMode>("self");
  const [agentId, setAgentId] = useState("");
  const [stageId, setStageId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ created: number; duplicates: number; invalid: number; problems: { row: number; reason: string }[] } | null>(null);

  const headers = rows[0] ?? [];
  const data = useMemo(() => rows.slice(1), [rows]);
  const mappedCols = new Set(Object.values(map).filter((i) => i >= 0));
  const canImport = (map.phone >= 0 || map.email >= 0) && data.length > 0 && data.length <= MAX_ROWS && !(mode === "agent" && !agentId);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const r = (await readFile(file)).filter((row) => row.some((c) => c.trim() !== ""));
      if (r.length < 2) return setError("The file needs a header row and at least one lead.");
      setFileName(file.name);
      setRows(r);
      setMap(suggestMapping(r[0]));
      setStep("map");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file");
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([templateCsv()], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const cell = (r: Cell[], f: ImportField) => (map[f] >= 0 ? (r[map[f]] ?? "").trim() : "");
  const toRow = (r: Cell[]) => {
    const extra: Record<string, string> = {};
    if (keepExtra)
      headers.forEach((h, i) => {
        const v = (r[i] ?? "").trim();
        if (!mappedCols.has(i) && h.trim() && v && Object.keys(extra).length < 25) extra[h.trim().slice(0, 60)] = v.slice(0, 500);
      });
    return { name: joinName(cell(r, "name"), cell(r, "lastName")), phone: cell(r, "phone"), email: cell(r, "email"), region: cell(r, "region"), notes: cell(r, "notes"), date: cell(r, "date"), extra };
  };

  async function run() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/leads/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: data.map(toRow), channel, assign: { mode, agentId }, stageId: stageId || undefined, fileName }) });
      const d = await res.json().catch(() => null);
      if (!res.ok) return setError(d?.error ?? "The import didn't work");
      setResult(d);
      setStep("result");
    } finally {
      setBusy(false);
    }
  }

  const preview = data.slice(0, 4).map(toRow);

  return (
    <Shell title="Import leads" subtitle={step === "file" ? "Add many leads at once from a CSV or Excel file." : step === "map" ? `${fileName} · ${data.length} lead${data.length === 1 ? "" : "s"} found` : undefined} onClose={() => (step === "result" ? (onDone(`Imported ${result?.created ?? 0} lead${result?.created === 1 ? "" : "s"}.`), undefined) : onClose())} wide={step === "map"}>
      {error && <div className="mb-4 rounded-xl bg-danger-bg px-4 py-3 text-[13.5px] text-danger">{error}</div>}

      {step === "file" && (
        <div className="flex flex-col gap-4">
          <label
            className="flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border bg-surface-muted/40 px-4 py-10 text-center text-[13.5px] text-muted transition-colors hover:border-primary hover:text-foreground"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              choose(e.dataTransfer.files[0]);
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
            </svg>
            <span className="font-medium text-foreground">Choose a file or drop it here</span>
            <span className="text-[12.5px]">CSV or Excel (.xlsx), up to {MAX_ROWS} leads and 5 MB</span>
            <input type="file" className="hidden" accept=".csv,.txt,.tsv,.xlsx" onChange={(e) => choose(e.target.files?.[0])} />
          </label>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-600">
            The first row should be the column names, such as Name, Phone, Email. Files exported from Facebook or Instagram lead forms work as they are. Phone numbers need the country code (+974…).{" "}
            <button type="button" onClick={downloadTemplate} className="font-medium underline" style={{ color: "var(--primary)" }}>
              Download an example file
            </button>
          </div>
        </div>
      )}

      {step === "map" && (
        <div className="flex flex-col gap-5">
          <div>
            <div className="mb-2 text-[14px] font-medium">Match your columns</div>
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {IMPORT_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className={labelCls}>
                    {f.label}
                    {f.key === "phone" || f.key === "email" ? <span className="text-muted"> · need at least one</span> : null}
                  </label>
                  <select value={map[f.key]} onChange={(e) => setMap((m) => ({ ...m, [f.key]: Number(e.target.value) }))} className={input}>
                    <option value={-1}>Don&apos;t import</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h.trim() || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {!(map.phone >= 0 || map.email >= 0) && <p className="mt-3 text-[13px] text-amber-800">Choose which column has the phone number or the email.</p>}
            {headers.some((_, i) => !mappedCols.has(i)) && (
              <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[13.5px]">
                <input type="checkbox" checked={keepExtra} onChange={(e) => setKeepExtra(e.target.checked)} />
                Keep the other columns too (shown under &ldquo;Enquiry details&rdquo; on each lead)
              </label>
            )}
          </div>

          <div>
            <div className="mb-2 text-[14px] font-medium">Preview</div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[520px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/60 text-[11.5px] uppercase tracking-wider text-muted">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Phone</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Area</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2">{r.name || <span className="text-muted">—</span>}</td>
                      <td className="px-3 py-2">{r.phone || <span className="text-muted">—</span>}</td>
                      <td className="px-3 py-2">{r.email || <span className="text-muted">—</span>}</td>
                      <td className="px-3 py-2">{r.region || <span className="text-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.length > MAX_ROWS && <p className="mt-2 text-[13px] text-danger">This file has {data.length} leads. Split it into files of {MAX_ROWS} or fewer.</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>How did these leads get in touch?</label>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} className={input}>
                {CHANNELS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {canManage && (
              <div>
                <label className={labelCls}>Start them in stage</label>
                <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={input}>
                  <option value="">The first stage</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {canManage && <AssignPicker mode={mode} setMode={setMode} agentId={agentId} setAgentId={setAgentId} agents={agents} />}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <button type="button" onClick={() => setStep("file")} className="rounded-xl px-4 py-2.5 text-[13.5px] text-slate-600 hover:bg-surface-muted">
              Choose another file
            </button>
            <button type="button" disabled={busy || !canImport} onClick={run} className={primaryBtn} style={{ background: "var(--primary)" }}>
              {busy ? "Importing…" : `Import ${data.length} lead${data.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}

      {step === "result" && result && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Imported", result.created, "var(--success)"],
              ["Already leads", result.duplicates, "var(--warning)"],
              ["Skipped", result.invalid, "var(--danger)"],
            ].map(([l, n, c]) => (
              <div key={l as string} className="rounded-xl bg-slate-50 px-4 py-3.5">
                <div className="tnum text-[26px] font-medium leading-none" style={{ color: c as string }}>
                  {n as number}
                </div>
                <div className="mt-1.5 text-[12.5px] text-muted">{l as string}</div>
              </div>
            ))}
          </div>
          {result.problems.length > 0 && (
            <div>
              <div className="mb-1.5 text-[13px] font-medium">Not imported</div>
              <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border text-[13px]">
                {result.problems.map((p, i) => (
                  <li key={i} className="flex justify-between gap-3 px-3.5 py-2">
                    <span className="text-muted">Row {p.row}</span>
                    <span className="text-right">{p.reason}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] text-muted">&ldquo;Already leads&rdquo; are people whose phone number or email is already in your leads. They were left as they are.</p>
            </div>
          )}
          <div className="flex justify-end">
            <button type="button" onClick={() => onDone(`Imported ${result.created} lead${result.created === 1 ? "" : "s"}.`)} className={primaryBtn} style={{ background: "var(--primary)" }}>
              Done
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}
