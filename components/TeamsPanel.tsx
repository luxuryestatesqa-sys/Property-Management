"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { useConfirm } from "@/components/ConfirmDialog";
import { extractErrorMessage } from "@/lib/errors";
import type { TeamDTO } from "@/lib/teams";
import type { UserDTO } from "@/lib/types";

const field = "w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-primary";

// Teams: a group of agents with a manager who sees only that group's leads, listings and dashboard.
export default function TeamsPanel({ users, onChanged }: { users: UserDTO[]; onChanged: () => void }) {
  const confirm = useConfirm();
  const [teams, setTeams] = useState<TeamDTO[] | null>(null);
  const [editing, setEditing] = useState<TeamDTO | "new" | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/teams");
    const data = await res.json().catch(() => null);
    setTeams(res.ok ? data.teams : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function remove(team: TeamDTO) {
    const ok = await confirm({ title: `Delete ${team.name}?`, message: "The people in it stay in the agency, they just leave the team. Nobody's leads or listings are deleted.", confirmLabel: "Delete team", danger: true });
    if (!ok) return;
    let res = await fetch(`/api/teams/${team.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    let data = await res.json().catch(() => null);
    if (res.status === 409 && data?.needsConfirm) {
      if (!(await confirm({ title: "Their manager will see everything", message: data.error, confirmLabel: "Delete anyway", danger: true }))) return;
      res = await fetch(`/api/teams/${team.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) });
      data = await res.json().catch(() => null);
    }
    if (!res.ok) return alert(extractErrorMessage(data?.error, "Couldn't delete the team"));
    setNotice(`${team.name} was deleted.`);
    await load();
    onChanged();
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13.5px] text-muted">A team manager sees the leads, listings, viewings and dashboard of the people in their team, and nothing from other teams. Agents only ever see their own work.</p>
        <button type="button" onClick={() => setEditing("new")} className="rounded-xl px-5 py-3 text-[14px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90" style={{ background: "var(--primary)" }}>
          + New team
        </button>
      </div>
      {notice && <div className="mt-3 rounded-xl bg-[var(--success-bg)] px-4 py-3 text-[13.5px] text-[var(--success)]">{notice}</div>}

      {teams === null ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl border border-border bg-surface" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-border py-12 text-center text-[14px] text-muted">No teams yet. Create one, for example “Sales Team A”, choose its manager and its people.</p>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => (
            <div key={t.id} className="rounded-2xl border border-border bg-surface p-4 lg:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[16px] font-semibold">{t.name}</h3>
                  <p className="mt-0.5 text-[13px] text-muted">{t.manager ? <>Managed by <strong className="font-medium text-foreground">{t.manager.name}</strong></> : "No manager yet"}</p>
                </div>
                <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-[11.5px] font-semibold text-muted">
                  {t.members.length} {t.members.length === 1 ? "person" : "people"}
                </span>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {t.members.length === 0 && <li className="text-[13px] text-muted">No one in this team yet.</li>}
                {t.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-1.5 rounded-full border border-border py-1 pl-1 pr-2.5 text-[12.5px]" style={m.status === "INACTIVE" ? { opacity: 0.55 } : undefined}>
                    <Avatar name={m.name} avatarUrl={m.avatarUrl} size={22} />
                    {m.name}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                <Link href={`/teams/${t.id}`} className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90" style={{ background: "var(--primary)" }}>
                  Open
                </Link>
                <button type="button" onClick={() => setEditing(t)} className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-semibold hover:bg-surface-muted">
                  Edit team
                </button>
                <button type="button" onClick={() => remove(t)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-danger hover:bg-danger-bg">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TeamModal
          team={editing === "new" ? null : editing}
          users={users}
          teams={teams ?? []}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            setNotice(message);
            setEditing(null);
            await load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function TeamModal({ team, users, teams, onClose, onSaved }: { team: TeamDTO | null; users: UserDTO[]; teams: TeamDTO[]; onClose: () => void; onSaved: (message: string) => void }) {
  const confirm = useConfirm();
  const [name, setName] = useState(team?.name ?? "");
  const [managerId, setManagerId] = useState(team?.manager?.id ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(team?.members.map((m) => m.id) ?? []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const managers = users.filter((u) => u.role === "MANAGER" && u.status === "ACTIVE");
  const people = users.filter((u) => (u.role === "AGENT" || u.role === "MANAGER") && u.status === "ACTIVE");
  const teamOf = (id: string) => teams.find((t) => t.id !== team?.id && t.members.some((m) => m.id === id))?.name;

  async function save(confirmed = false): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(team ? `/api/teams/${team.id}` : "/api/teams", {
        method: team ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, managerId: managerId || null, memberIds, ...(confirmed ? { confirm: true } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 409 && data?.needsConfirm) {
        setBusy(false);
        if (await confirm({ title: "Their manager will see everything", message: data.error, confirmLabel: "Continue", danger: true })) return save(true);
        return;
      }
      if (!res.ok) return setError(extractErrorMessage(data?.error, "Couldn't save the team"));
      const granted: string[] = data?.grantedToManager ?? [];
      onSaved(granted.length ? `${name} saved. The manager was given the permissions needed to run a team (${granted.length} added); you can adjust them under Permissions.` : `${name} saved.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-[rgba(13,31,92,0.4)] backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={team ? "Edit team" : "New team"} className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background sm:rounded-3xl">
        <form
          className="flex flex-col gap-4 px-5 py-6"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{team ? "Edit team" : "New team"}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-muted text-muted">
              ✕
            </button>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="team-name">
              Team name
            </label>
            <input id="team-name" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales Team A" className={field} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="team-manager">
              Team manager
            </label>
            <select id="team-manager" value={managerId} onChange={(e) => setManagerId(e.target.value)} className={field}>
              <option value="">No manager yet</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[12px] text-muted">Only people with the Manager role can lead a team. They will see this team&apos;s leads, listings, viewings and dashboard, and nobody else&apos;s.</p>
            {managers.length === 0 && <p className="mt-1 text-[12px] text-danger">There are no Managers yet. Add a user with the Manager role first.</p>}
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">People in the team</legend>
            <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {people.length === 0 && <li className="px-4 py-3 text-[13px] text-muted">No agents yet.</li>}
              {people.map((u) => {
                const other = teamOf(u.id);
                const on = memberIds.includes(u.id);
                return (
                  <li key={u.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-surface-muted">
                      <input type="checkbox" className="h-4 w-4" checked={on} onChange={() => setMemberIds(on ? memberIds.filter((x) => x !== u.id) : [...memberIds, u.id])} />
                      <Avatar name={u.name} avatarUrl={u.avatarUrl} size={28} />
                      <span className="min-w-0 flex-1 truncate text-[14px]">
                        {u.name} <span className="text-[12px] text-muted">{u.role === "MANAGER" ? "Manager" : "Agent"}</span>
                      </span>
                      {other && on && <span className="shrink-0 text-[11.5px] text-amber-600">moves from {other}</span>}
                      {other && !on && <span className="shrink-0 text-[11.5px] text-muted">in {other}</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-[12px] text-muted">Someone can be in one team. Adding them here moves them out of their current team.</p>
          </fieldset>
          {error && <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>}
          <button type="submit" disabled={busy} className="w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80 disabled:opacity-60" style={{ background: "var(--primary)" }}>
            {busy ? "Saving…" : team ? "Save team" : "Create team"}
          </button>
        </form>
      </div>
    </div>
  );
}
