"use client";

import { useMemo, useState } from "react";
import Avatar from "@/components/Avatar";
import { LeadGroupDTO, LeadStageDTO } from "@/components/leads/leadTypes";

type Agent = { id: string; name: string; avatarUrl: string | null };
type Panel = null | "assign" | "stage" | "group" | "delete";

const icon = {
  user: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M19 8v6M22 11h-6",
  stage: "M5 12h14M13 6l6 6-6 6",
  group: "M4 6h16M4 12h16M4 18h10",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
};

function Ico({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// The bar that appears when leads are ticked: change agent, stage or group for all of them at
// once, or delete them. Each action opens a small popup that asks before anything changes.
export default function BulkBar({ selected, onClear, onDone, canManage, isAdmin, stages, agents, groups }: { selected: string[]; onClear: () => void; onDone: (message: string) => void; canManage: boolean; isAdmin: boolean; stages: LeadStageDTO[]; agents: Agent[]; groups: LeadGroupDTO[] }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // assign
  const [roundRobin, setRoundRobin] = useState(false);
  const [agentPick, setAgentPick] = useState<string | null>(null); // "" = Unassigned
  const [multi, setMulti] = useState<string[]>([]);
  const [q, setQ] = useState("");
  // stage / group
  const [stageId, setStageId] = useState("");
  const [groupId, setGroupId] = useState("");

  const n = selected.length;
  const noun = `${n} lead${n === 1 ? "" : "s"}`;
  const shown = useMemo(() => agents.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase())), [agents, q]);

  function open(p: Panel) {
    setError("");
    setQ("");
    setAgentPick(null);
    setMulti([]);
    setRoundRobin(false);
    setStageId("");
    setGroupId("");
    setPanel(p);
  }

  async function run(body: Record<string, unknown>, done: (count: number) => string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/leads/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadIds: selected, ...body }) });
      const d = await res.json().catch(() => null);
      if (!res.ok) return setError(d?.error ?? "That didn't work");
      setPanel(null);
      onDone(done(d.count));
    } finally {
      setBusy(false);
    }
  }

  const pill = "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors hover:bg-white/10";
  const primary = "rounded-xl px-5 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50";

  return (
    <>
      <div className="sticky bottom-4 z-30 mt-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-900 px-3 py-2.5 text-white shadow-2xl" role="toolbar" aria-label="Actions for selected leads">
        <div className="flex items-center gap-2 rounded-lg border border-white/25 py-1.5 pl-3 pr-2 text-[13.5px] font-semibold">
          {n} selected
          <button type="button" onClick={onClear} aria-label="Clear selection" className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-white/15">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {canManage && (
            <button type="button" className={pill} onClick={() => open("assign")}>
              <Ico d={icon.user} />
              Reassign
            </button>
          )}
          <button type="button" className={pill} onClick={() => open("stage")}>
            <Ico d={icon.stage} />
            Change stage
          </button>
          <button type="button" className={pill} onClick={() => open("group")}>
            <Ico d={icon.group} />
            Groups
          </button>
          {isAdmin && (
            <button type="button" className={`${pill} text-rose-300`} onClick={() => open("delete")}>
              <Ico d={icon.trash} />
              Delete
            </button>
          )}
        </div>
      </div>

      {panel && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 lg:items-center lg:p-6" onMouseDown={(e) => e.target === e.currentTarget && setPanel(null)}>
          <div role="dialog" className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-2xl lg:max-w-xl lg:rounded-3xl lg:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[20px] font-semibold tracking-[-0.01em]">{panel === "assign" ? "Assign leads" : panel === "stage" ? "Change stage" : panel === "group" ? "Groups" : "Delete leads"}</h2>
                <p className="mt-1 text-[13.5px] text-muted">
                  {panel === "assign" && `Choose a team member for these ${noun}, or share them across several team members with round robin.`}
                  {panel === "stage" && `Move ${noun} to another stage.`}
                  {panel === "group" && `Add ${noun} to a group, or take them out of it.`}
                  {panel === "delete" && `You are about to delete ${noun}.`}
                </p>
              </div>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-muted">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            {error && <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-[13.5px] text-danger">{error}</div>}

            {panel === "assign" && (
              <div className="mt-4">
                <label className="flex cursor-pointer items-center gap-2.5 text-[14px]">
                  <input type="checkbox" checked={roundRobin} onChange={(e) => setRoundRobin(e.target.checked)} />
                  Share evenly with round robin
                </label>
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-muted px-3.5">
                  <svg className="shrink-0 text-muted" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input autoFocus data-bare value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team members" className="min-w-0 flex-1 bg-transparent py-3 text-[14px] outline-none" />
                </div>
                <ul className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-border">
                  {!roundRobin && "unassigned".includes(q.trim().toLowerCase()) && (
                    <li>
                      <button type="button" onClick={() => setAgentPick("")} className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left ${agentPick === "" ? "bg-accent-light" : "hover:bg-surface-muted"}`}>
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500 text-white">
                          <Ico d={icon.user} />
                        </span>
                        <span className="text-[14px] font-semibold">Unassigned</span>
                      </button>
                    </li>
                  )}
                  {shown.map((a) => {
                    const on = roundRobin ? multi.includes(a.id) : agentPick === a.id;
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => (roundRobin ? setMulti((m) => (m.includes(a.id) ? m.filter((x) => x !== a.id) : [...m, a.id])) : setAgentPick(a.id))}
                          className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 ${on ? "bg-accent-light" : "hover:bg-surface-muted"}`}
                        >
                          <Avatar name={a.name} avatarUrl={a.avatarUrl} size={36} />
                          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{a.name}</span>
                          <span className={`flex h-5 w-5 items-center justify-center ${roundRobin ? "rounded" : "rounded-full"} border-2 ${on ? "border-primary bg-primary text-white" : "border-slate-300"}`}>
                            {on && (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 12.5l4.5 4.5L19 7.5" />
                              </svg>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {shown.length === 0 && <li className="px-4 py-5 text-center text-[13px] text-muted">No team member found</li>}
                </ul>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="text-[12.5px] text-muted">{roundRobin ? `${multi.length} team member${multi.length === 1 ? "" : "s"} chosen` : ""}</span>
                  <button
                    type="button"
                    disabled={busy || (roundRobin ? multi.length === 0 : agentPick === null)}
                    onClick={() => run(roundRobin ? { action: "assign", roundRobin: true, agentIds: multi } : { action: "assign", agentId: agentPick || null }, (c) => (c === 0 ? "Nothing changed. They already have that team member." : `Assigned ${c} lead${c === 1 ? "" : "s"}.`))}
                    className={primary}
                    style={{ background: "var(--primary)" }}
                  >
                    {busy ? "Assigning…" : "Assign"}
                  </button>
                </div>
              </div>
            )}

            {panel === "stage" && (
              <div className="mt-4">
                <ul className="flex flex-col gap-1.5">
                  {stages.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => setStageId(s.id)} className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${stageId === s.id ? "border-primary bg-accent-light" : "border-border hover:bg-surface-muted"}`}>
                        <span className="h-3 w-3 rounded-full" style={{ background: s.color ?? "#6366f1" }} />
                        <span className="text-[14px] font-semibold">{s.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex justify-end">
                  <button type="button" disabled={busy || !stageId} onClick={() => run({ action: "stage", stageId }, (c) => (c === 0 ? "They were already in that stage." : `Moved ${c} lead${c === 1 ? "" : "s"}.`))} className={primary} style={{ background: "var(--primary)" }}>
                    {busy ? "Moving…" : "Move"}
                  </button>
                </div>
              </div>
            )}

            {panel === "group" && (
              <div className="mt-4">
                {groups.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13.5px] text-muted">No groups yet. Create one from any lead&apos;s page.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {groups.map((g) => (
                      <li key={g.id}>
                        <button type="button" onClick={() => setGroupId(g.id)} className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${groupId === g.id ? "border-primary bg-accent-light" : "border-border hover:bg-surface-muted"}`}>
                          <span className="h-3 w-3 rounded-full" style={{ background: g.color ?? "#6366f1" }} />
                          <span className="text-[14px] font-semibold">{g.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" disabled={busy || !groupId} onClick={() => run({ action: "group-remove", groupId }, (c) => `Removed ${c} lead${c === 1 ? "" : "s"} from the group.`)} className="rounded-xl bg-surface-muted px-5 py-2.5 text-[13.5px] font-semibold hover:bg-border disabled:opacity-50">
                    Remove from group
                  </button>
                  <button type="button" disabled={busy || !groupId} onClick={() => run({ action: "group-add", groupId }, (c) => `Added ${c} lead${c === 1 ? "" : "s"} to the group.`)} className={primary} style={{ background: "var(--primary)" }}>
                    Add to group
                  </button>
                </div>
              </div>
            )}

            {panel === "delete" && (
              <div className="mt-4">
                <div className="rounded-xl bg-rose-50 px-4 py-3 text-[13.5px] leading-relaxed text-rose-800">This also deletes their notes, voice notes, files and follow-ups. It can&apos;t be undone.</div>
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => setPanel(null)} className="rounded-xl px-5 py-2.5 text-[13.5px] font-medium text-slate-600 hover:bg-surface-muted">
                    Cancel
                  </button>
                  <button type="button" disabled={busy} onClick={() => run({ action: "delete" }, (c) => `Deleted ${c} lead${c === 1 ? "" : "s"}.`)} className="rounded-xl bg-rose-600 px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                    {busy ? "Deleting…" : `Delete ${noun}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
