"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { extractErrorMessage } from "@/lib/errors";
import { ALL_PERMISSIONS, isSuperAdminRole, normalizePermissions, type Permission } from "@/lib/permissions";
import PermissionPicker from "@/components/PermissionPicker";
import type { UserDTO } from "@/lib/types";

type Templates = { ADMIN: Permission[]; MANAGER: Permission[]; AGENT: Permission[] };
const ROLE_NAME = { ADMIN: "Admin", MANAGER: "Manager", AGENT: "Agent" } as const;

function Shell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-[rgba(13,31,92,0.4)] backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background sm:rounded-3xl">
        <div className="flex flex-col gap-4 px-5 py-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{title}</h2>
              {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted">
              ✕
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

const primaryBtn = "w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80 disabled:opacity-60";

// The permissions the signed-in person may NOT hand out: everything they do not have themselves.
export function useLockedPermissions(): string[] {
  const { data: session } = useSession();
  if (isSuperAdminRole(session?.user?.role)) return [];
  const mine = session?.user?.permissions ?? [];
  return ALL_PERMISSIONS.filter((p) => !mine.includes(p));
}

// What one person may do. Saved on their account; "Use the role's template" makes them follow the template again.
export function UserPermissionsModal({ user, onClose, onSaved }: { user: UserDTO; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState<Permission[]>(normalizePermissions(user.permissions ?? []));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useLockedPermissions();

  async function save(next: Permission[] | null) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions: next }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setError(extractErrorMessage(data?.error, "Couldn't save the permissions"));
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title={`Permissions for ${user.name}`} subtitle={user.customPermissions ? "Set for this person." : `Following the ${user.role === "ADMIN" ? "Admin" : user.role === "MANAGER" ? "Manager" : "Agent"} template.`} onClose={onClose}>
      <PermissionPicker value={value} onChange={setValue} locked={locked} />
      {error && <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>}
      <button type="button" disabled={busy} onClick={() => save(value)} className={primaryBtn} style={{ background: "var(--primary)" }}>
        {busy ? "Saving…" : "Save permissions"}
      </button>
      {user.customPermissions && (
        <button type="button" disabled={busy} onClick={() => save(null)} className="text-[13px] font-semibold text-primary">
          Use the role&apos;s template instead
        </button>
      )}
    </Shell>
  );
}

// What a new Manager or Agent starts with, and what anyone without their own choices follows. Super Admins only.
export function RoleTemplatesModal({ onClose }: { onClose: () => void }) {
  const [templates, setTemplates] = useState<Templates | null>(null);
  const [tab, setTab] = useState<"ADMIN" | "MANAGER" | "AGENT">("MANAGER");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/org/permissions")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates))
      .catch(() => setError("Couldn't load the templates"));
  }, []);

  async function save() {
    if (!templates) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/org/permissions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(templates) });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setError(extractErrorMessage(data?.error, "Couldn't save the templates"));
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Role templates" subtitle="What a new Admin, Manager or Agent starts with. You can still change it for each person. The Super Admin always has everything." onClose={onClose}>
      <div className="flex gap-1 rounded-xl bg-surface-muted p-1">
        {(["ADMIN", "MANAGER", "AGENT"] as const).map((r) => (
          <button key={r} type="button" onClick={() => setTab(r)} className={`flex-1 rounded-lg py-2.5 text-[13px] font-medium ${tab === r ? "bg-surface shadow-sm" : "text-muted"}`} style={tab === r ? { color: "var(--primary)" } : undefined}>
            {ROLE_NAME[r]}
          </button>
        ))}
      </div>
      {templates ? (
        <PermissionPicker
          value={templates[tab]}
          onChange={(next) => {
            setSaved(false);
            setTemplates({ ...templates, [tab]: next });
          }}
        />
      ) : (
        <p className="text-sm text-muted">Loading…</p>
      )}
      <p className="text-[12px] text-muted">Changing a template does not change people who already have their own permissions set.</p>
      {error && <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>}
      {saved && <div className="rounded-xl bg-[var(--success-bg)] px-4 py-3 text-sm text-[var(--success)]">Saved.</div>}
      <button type="button" disabled={busy || !templates} onClick={save} className={primaryBtn} style={{ background: "var(--primary)" }}>
        {busy ? "Saving…" : "Save templates"}
      </button>
    </Shell>
  );
}
