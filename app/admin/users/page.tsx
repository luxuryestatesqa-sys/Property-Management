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

  if (isDesktop) {
    const th = "whitespace-nowrap px-4 py-3";
    const ghost = "whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-50";
    return (
      <div>
        <div className="flex items-end justify-between gap-6 pb-7 pt-10">
          <div>
            <h1 className="text-[32px] font-bold leading-none tracking-tight">Users</h1>
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
                  <th className={`${th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
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
                        <div className="flex items-center justify-end gap-1.5">
                          {!isSelf && (
                            <>
                              <button onClick={() => setResetUser(u)} disabled={busyId === u.id} className={`${ghost} hover:opacity-80`} style={{ background: "var(--accent-light)", color: "var(--primary)" }}>
                                Reset password
                              </button>
                              <button
                                onClick={() => toggleStatus(u)}
                                disabled={busyId === u.id}
                                className={`${ghost} hover:opacity-80 ${u.status === "ACTIVE" ? "bg-danger-bg text-danger" : "bg-success-bg"}`}
                                style={u.status === "INACTIVE" ? { color: "var(--success)" } : undefined}
                              >
                                {u.status === "ACTIVE" ? "Deactivate" : "Activate"}
                              </button>
                              <button onClick={() => removeUser(u)} disabled={busyId === u.id} className={`${ghost} bg-surface-muted text-foreground hover:bg-border`}>
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
