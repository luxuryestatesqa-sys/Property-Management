"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { extractErrorMessage } from "@/lib/errors";
import { DEFAULT_PERMISSIONS, isSuperAdminRole, type Permission } from "@/lib/permissions";
import PermissionPicker from "@/components/PermissionPicker";
import { useLockedPermissions } from "@/components/PermissionsModal";

type Tab = "details" | "permissions";

export default function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [tab, setTab] = useState<Tab>("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"AGENT" | "MANAGER" | "ADMIN">("AGENT");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { data: session } = useSession();
  const locked = useLockedPermissions();
  const [templates, setTemplates] = useState<{ ADMIN: Permission[]; MANAGER: Permission[]; AGENT: Permission[] }>(DEFAULT_PERMISSIONS);
  const [permissions, setPermissions] = useState<Permission[]>(DEFAULT_PERMISSIONS.AGENT);
  const [touched, setTouched] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const canMakeAdmin = isSuperAdminRole(session?.user?.role);

  // A new person starts from the agency's template for their role; the Permissions tab can then change it.
  useEffect(() => {
    fetch("/api/org/permissions")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.templates && setTemplates(d.templates))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!touched) setPermissions(templates[role].filter((p) => !locked.includes(p)));
  }, [role, templates, touched, locked]);

  const detailsFilled = Boolean(name.trim() && email.trim() && whatsapp.trim() && password);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    // The fields live on the Details tab; if one is empty, go back there instead of failing silently.
    if (!detailsFilled) {
      setTab("details");
      setError("Fill in the name, email, WhatsApp number and password first.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, whatsapp, password, role, permissions }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(extractErrorMessage(data.error, "Failed to create user"));
        return;
      }
      onCreated();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    setError("");
    if (formRef.current && !formRef.current.reportValidity()) return;
    setTab("permissions");
  }

  const input = "w-full rounded-xl border border-border px-4 py-3 text-base outline-none focus:border-primary";
  const roleName = role === "ADMIN" ? "Admin" : role === "MANAGER" ? "Manager" : "Agent";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-[rgba(13,31,92,0.4)] backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Add user" className="relative bg-background rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <form ref={formRef} onSubmit={submit} className="px-5 py-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Add User</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-muted text-muted">
              ✕
            </button>
          </div>

          <div role="tablist" aria-label="Add user steps" className="flex bg-surface-muted rounded-xl p-1 gap-1">
            {([["details", "Details"], ["permissions", "Permissions"]] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => (key === "permissions" ? next() : setTab("details"))}
                className={`flex-1 text-[13px] font-medium py-2.5 rounded-lg ${tab === key ? "bg-surface shadow-sm" : "text-muted"}`}
                style={tab === key ? { color: "var(--primary)" } : undefined}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "details" ? (
            <>
              <div>
                <label className="text-sm font-medium block mb-1.5">Name</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Agent full name" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">Email</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="agent@company.com" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">WhatsApp Number</label>
                <input type="tel" required value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className={input} placeholder="e.g. +974 5000 0000" />
                <p className="text-[12px] text-muted mt-1">Other agents will use this to contact them directly.</p>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">Temporary Password</label>
                <input type="text" required value={password} onChange={(e) => setPassword(e.target.value)} className={input} placeholder="At least 6 characters" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">Role</label>
                <div className="flex bg-surface-muted rounded-xl p-1 gap-1">
                  {(["AGENT", "MANAGER", "ADMIN"] as const)
                    .filter((r) => r !== "ADMIN" || canMakeAdmin)
                    .map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setRole(r);
                          setTouched(false);
                        }}
                        className={`flex-1 text-[13px] font-medium py-2.5 rounded-lg ${role === r ? "bg-surface shadow-sm" : "text-muted"}`}
                        style={role === r ? { color: "var(--primary)" } : undefined}
                      >
                        {r === "AGENT" ? "Agent" : r === "MANAGER" ? "Manager" : "Admin"}
                      </button>
                    ))}
                </div>
              </div>
            </>
          ) : (
            <div>
              <p className="text-[13px] text-muted mb-3">
                {name.trim() || "This person"} is a <strong>{roleName}</strong>. The boxes start from the {roleName} template; tick what they may do.
              </p>
              <PermissionPicker
                value={permissions}
                locked={locked}
                onChange={(next) => {
                  setTouched(true);
                  setPermissions(next);
                }}
              />
            </div>
          )}

          {error && <div className="rounded-xl bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>}

          {tab === "details" ? (
            <button type="button" onClick={next} className="w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80 mt-1" style={{ background: "var(--primary)" }}>
              Next: Permissions
            </button>
          ) : (
            <button type="submit" disabled={submitting} className="w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80 disabled:opacity-60 mt-1" style={{ background: "var(--primary)" }}>
              {submitting ? "Creating..." : "Create User"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
