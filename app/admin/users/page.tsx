"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { UserDTO } from "@/lib/types";
import { formatDate } from "@/lib/format";
import AddUserModal from "@/components/AddUserModal";
import ResetPasswordModal from "@/components/ResetPasswordModal";
import LinkPropertyFinderModal from "@/components/LinkPropertyFinderModal";
import WhatsAppButton from "@/components/WhatsAppButton";
import Avatar from "@/components/Avatar";
import { useConfirm } from "@/components/ConfirmDialog";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { ROLE_LABELS } from "@/lib/roles";
import RowMenu from "@/components/desktop/RowMenu";

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const confirm = useConfirm();
  const isDesktop = useIsDesktop();
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [resetUser, setResetUser] = useState<UserDTO | null>(null);
  const [pfLinkUser, setPfLinkUser] = useState<UserDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roleTab, setRoleTab] = useState<"ALL" | "ADMIN" | "MANAGER" | "AGENT" | "INACTIVE">("ALL");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data.users ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleStatus(u: UserDTO) {
    const nextStatus = u.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) await load();
      else {
        const data = await res.json();
        alert(data.error ?? "Failed to update user");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function changeRole(u: UserDTO, role: "ADMIN" | "MANAGER" | "AGENT") {
    const confirmed = await confirm({
      title: `Make ${ROLE_LABELS[role]}?`,
      message: `${u.name} will become ${role === "ADMIN" ? "an Admin with full access to settings, users and every listing" : role === "MANAGER" ? "a Manager who can see and assign all of the agency's work" : "an Agent"}.`,
      confirmLabel: "Change role",
    });
    if (!confirmed) return;
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      if (res.ok) await load();
      else alert((await res.json().catch(() => null))?.error ?? "Failed to change role");
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(u: UserDTO) {
    const confirmed = await confirm({
      title: "Remove User?",
      message: `Remove ${u.name}? If they have listings, they'll be deactivated instead of removed, to preserve listing history.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!confirmed) return;
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        if (data.note) alert(data.note);
        await load();
      } else {
        alert(data.error ?? "Failed to remove user");
      }
    } finally {
      setBusyId(null);
    }
  }

  const needle = search.trim().toLowerCase();
  const visibleUsers = users.filter((u) => {
    if (roleTab === "ADMIN" && !(u.role === "OWNER" || u.role === "ADMIN")) return false;
    if (roleTab === "MANAGER" && u.role !== "MANAGER") return false;
    if (roleTab === "AGENT" && u.role !== "AGENT") return false;
    if (roleTab === "INACTIVE" && u.status !== "INACTIVE") return false;
    return !needle || [u.name, u.email, u.whatsapp].some((v) => v.toLowerCase().includes(needle));
  });

  if (isDesktop) {
    const th = "whitespace-nowrap px-4 py-3";
    const ghost = "whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-50";
    return (
      <div>
        <div className="flex items-end justify-between gap-6 pb-7 pt-10">
          <div>
            <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">Users</h1>
            <p className="mt-2.5 text-[15px] text-muted">Manage your team, their access and Property Finder links.</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-xl px-5 py-3 text-[14px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ background: "var(--primary)" }}
          >
            + Add User
          </button>
        </div>

        {(() => {
          const active = users.filter((u) => u.status === "ACTIVE").length;
          const listingsTotal = users.reduce((n, u) => n + (u.activeListingsCount ?? 0), 0);
          const pfLinked = users.filter((u) => u.pfPublicProfileId).length;
          const cards = [
            { label: "Team members", value: users.length, hint: [["admin", users.filter((u) => u.role === "OWNER" || u.role === "ADMIN").length], ["manager", users.filter((u) => u.role === "MANAGER").length], ["agent", users.filter((u) => u.role === "AGENT").length]].filter(([, n]) => (n as number) > 0).map(([w, n]) => `${n} ${w}${n === 1 ? "" : "s"}`).join(" · ") || "—" },
            { label: "Active", value: active, hint: users.length - active > 0 ? `${users.length - active} inactive` : "Everyone can sign in" },
            { label: "Active listings", value: listingsTotal, hint: users.length ? `${(listingsTotal / users.length).toFixed(1)} per member` : "—" },
            { label: "Property Finder linked", value: `${pfLinked}/${users.length}`, hint: users.length - pfLinked > 0 ? `${users.length - pfLinked} not linked yet` : "All linked" },
          ];
          return (
            <div className="stagger mb-7 grid grid-cols-4 gap-4">
              {cards.map((c) => (
                <div key={c.label} className="surface-card p-5">
                  <div className="text-[12.5px] font-medium text-muted">{c.label}</div>
                  <div className="tnum mt-2 text-[30px] font-semibold leading-none tracking-tight">{loading ? <span className="inline-block h-7 w-10 animate-pulse rounded bg-surface-muted" /> : c.value}</div>
                  <div className="mt-2 truncate text-[12px] text-muted">{loading ? " " : c.hint}</div>
                </div>
              ))}
            </div>
          );
        })()}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-xl bg-slate-200/70 p-1" role="tablist">
            {(
              [
                ["ALL", "All", users.length],
                ["ADMIN", "Admins", users.filter((u) => u.role === "OWNER" || u.role === "ADMIN").length],
                ["MANAGER", "Managers", users.filter((u) => u.role === "MANAGER").length],
                ["AGENT", "Agents", users.filter((u) => u.role === "AGENT").length],
                ["INACTIVE", "Inactive", users.filter((u) => u.status === "INACTIVE").length],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={roleTab === key}
                onClick={() => setRoleTab(key)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-medium transition-all ${roleTab === key ? "bg-white text-foreground shadow-[0_1px_2px_rgba(16,24,40,.1),0_0_0_1px_rgba(16,24,40,.04)]" : "text-slate-500 hover:text-foreground"}`}
              >
                {label}
                <span className={`tnum rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${roleTab === key ? "bg-slate-100 text-slate-700" : "bg-white/70 text-slate-500"}`}>{count}</span>
              </button>
            ))}
          </div>
          <div className="flex w-72 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 shadow-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-accent-light">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input data-bare value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or phone" className="min-w-0 flex-1 bg-transparent py-2.5 text-[14px] outline-none" />
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-2xl border border-border bg-surface" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(20,24,31,.04)]">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-surface-muted/60 text-[11.5px] font-semibold uppercase tracking-wider text-muted">
                  <th className={th}>User</th>
                  <th className={th}>Role</th>
                  <th className={th}>Status</th>
                  <th className={th}>Listings</th>
                  <th className={th}>Property Finder</th>
                  <th className={th}>Joined</th>
                  <th className={`${th} w-14`} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((u) => {
                  const isSelf = u.id === session?.user?.id;
                  return (
                    <tr key={u.id} className="border-b border-border last:border-b-0 hover:bg-surface-muted/40">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} avatarUrl={u.avatarUrl} size={38} />
                          <div className="min-w-0">
                            <div className="truncate text-[14px] font-semibold">
                              {u.name}
                              {isSelf && <span className="ml-1.5 text-[12px] font-normal text-muted">(you)</span>}
                            </div>
                            <div className="truncate text-[12.5px] text-muted">{u.email}</div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted">
                              {u.whatsapp}
                              {!isSelf && <WhatsAppButton number={u.whatsapp} name={u.name} size={20} />}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "var(--accent-light)", color: "var(--primary)" }}>
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: u.status === "ACTIVE" ? "var(--success)" : "var(--muted)" }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: u.status === "ACTIVE" ? "var(--success)" : "var(--muted)" }} />
                          {u.status === "ACTIVE" ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-[14px] font-semibold">{u.activeListingsCount ?? 0}</td>
                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => setPfLinkUser(u)}
                          disabled={busyId === u.id}
                          className={`${ghost} ${u.pfPublicProfileId ? "bg-success-bg" : "bg-surface-muted text-foreground hover:bg-border"}`}
                          style={u.pfPublicProfileId ? { color: "var(--success)" } : undefined}
                        >
                          {u.pfPublicProfileId ? "Linked" : "Link account"}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[12.5px] text-muted">{new Date(u.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end">
                          {/* Only the owner can touch the owner account; nobody manages themselves here. */}
                          {!isSelf && !(u.role === "OWNER" && session?.user?.role !== "OWNER") && (
                            <RowMenu
                              disabled={busyId === u.id}
                              items={[
                                { label: "Reset password", onClick: () => setResetUser(u) },
                                { label: u.pfPublicProfileId ? "Property Finder account…" : "Link Property Finder…", onClick: () => setPfLinkUser(u) },
                                { label: "Make Agent", onClick: () => changeRole(u, "AGENT"), hidden: u.role === "AGENT" || u.role === "OWNER", separator: true },
                                { label: "Make Manager", onClick: () => changeRole(u, "MANAGER"), hidden: u.role === "MANAGER" || u.role === "OWNER", separator: u.role === "AGENT" ? true : false },
                                { label: "Make Admin", onClick: () => changeRole(u, "ADMIN"), hidden: u.role === "ADMIN" || u.role === "OWNER" },
                                { label: u.status === "ACTIVE" ? "Deactivate user" : "Activate user", onClick: () => toggleStatus(u), separator: true },
                                { label: "Remove user", onClick: () => removeUser(u), danger: true },
                              ]}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visibleUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-14 text-center text-[14px] text-muted">
                      No team members match{search ? ` “${search}”` : " this filter"}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onCreated={load} />}
        {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
        {pfLinkUser && <LinkPropertyFinderModal user={pfLinkUser} onClose={() => setPfLinkUser(null)} onSaved={load} />}
      </div>
    );
  }

  return (
    <div className="px-4 pb-10 lg:px-0">
      <div className="sticky top-0 z-20 bg-background safe-top pt-4 pb-3 flex items-center justify-between lg:pt-8 lg:pb-5">
        <div>
          <h1 className="text-xl font-bold lg:text-3xl lg:tracking-tight">Users</h1>
          <p className="hidden lg:block text-[14px] text-muted mt-1">Manage your team, their access and portal links.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white active:opacity-80 lg:px-5 lg:hover:opacity-90"
          style={{ background: "var(--primary)" }}
        >
          + Add User
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 mt-2 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl bg-surface border border-border p-4 h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3 mt-2 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-5 lg:items-start">
          {users.map((u) => {
            const isSelf = u.id === session?.user?.id;
            return (
              <div key={u.id} className="rounded-2xl bg-surface border border-border p-4 lg:p-5 lg:hover:shadow-md lg:transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex items-start gap-2.5">
                    <Avatar name={u.name} avatarUrl={u.avatarUrl} size={38} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-[15px] truncate">{u.name}</h3>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: "var(--accent-light)", color: "var(--primary)" }}
                        >
                          {ROLE_LABELS[u.role]}
                        </span>
                      </div>
                      <p className="text-[13px] text-muted truncate mt-0.5">{u.email}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-[13px] text-muted truncate">{u.whatsapp}</p>
                        {!isSelf && <WhatsAppButton number={u.whatsapp} name={u.name} size={28} />}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-[11px] font-semibold px-2 py-1 rounded-lg ${
                      u.status === "ACTIVE" ? "bg-success-bg" : "bg-danger-bg text-danger"
                    }`}
                    style={u.status === "ACTIVE" ? { color: "var(--success)" } : undefined}
                  >
                    {u.status === "ACTIVE" ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-3 text-[12px] text-muted">
                  <span>{u.activeListingsCount ?? 0} active listing{(u.activeListingsCount ?? 0) === 1 ? "" : "s"}</span>
                  <span>Joined {formatDate(u.createdAt)}</span>
                </div>

                <div className="mt-3 pt-3 border-t border-border flex flex-col gap-2">
                  {/* Linking your own Property Finder account is safe and not
                      self-locking (unlike reset/deactivate/remove below), so
                      it's available on the admin's own row too - otherwise
                      an admin who also publishes listings could never link
                      themselves. */}
                  <button
                    onClick={() => setPfLinkUser(u)}
                    disabled={busyId === u.id}
                    className="w-full rounded-lg py-2.5 text-[13px] font-semibold active:opacity-70 disabled:opacity-60 bg-surface-muted text-foreground"
                  >
                    {u.pfPublicProfileId ? "Property Finder: Linked" : "Link Property Finder Account"}
                  </button>
                  {!isSelf && (
                    <>
                      <button
                        onClick={() => setResetUser(u)}
                        disabled={busyId === u.id}
                        className="w-full rounded-lg py-2.5 text-[13px] font-semibold active:opacity-70 disabled:opacity-60"
                        style={{ background: "var(--accent-light)", color: "var(--primary)" }}
                      >
                        Reset Password
                      </button>
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleStatus(u)}
                          disabled={busyId === u.id}
                          className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold active:opacity-70 disabled:opacity-60 ${
                            u.status === "ACTIVE" ? "bg-danger-bg text-danger" : "bg-success-bg"
                          }`}
                          style={u.status === "INACTIVE" ? { color: "var(--success)" } : undefined}
                        >
                          {u.status === "ACTIVE" ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => removeUser(u)}
                          disabled={busyId === u.id}
                          className="flex-1 rounded-lg py-2.5 text-[13px] font-semibold bg-surface-muted text-foreground active:opacity-70 disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onCreated={load} />}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
      {pfLinkUser && <LinkPropertyFinderModal user={pfLinkUser} onClose={() => setPfLinkUser(null)} onSaved={load} />}
    </div>
  );
}
