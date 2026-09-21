"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { UserDTO } from "@/lib/types";
import { formatDate } from "@/lib/format";
import AddUserModal from "@/components/AddUserModal";
import ResetPasswordModal from "@/components/ResetPasswordModal";
import WhatsAppButton from "@/components/WhatsAppButton";
import Avatar from "@/components/Avatar";

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [resetUser, setResetUser] = useState<UserDTO | null>(null);
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
    if (!window.confirm(`Remove ${u.name}? If they have listings, they will be deactivated instead to preserve history.`)) return;
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

  return (
    <div className="px-4 pb-10">
      <div className="sticky top-0 z-20 bg-background safe-top pt-4 pb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">Users</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white active:opacity-80"
          style={{ background: "var(--primary)" }}
        >
          + Add User
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3 mt-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl bg-surface border border-border p-4 h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3 mt-2">
          {users.map((u) => {
            const isSelf = u.id === session?.user?.id;
            return (
              <div key={u.id} className="rounded-2xl bg-surface border border-border p-4">
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
                          {u.role}
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

                {!isSelf && (
                  <div className="mt-3 pt-3 border-t border-border flex flex-col gap-2">
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onCreated={load} />}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
    </div>
  );
}
