"use client";

import { useState } from "react";
import { extractErrorMessage } from "@/lib/errors";

export default function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"AGENT" | "ADMIN">("AGENT");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, whatsapp, password, role }),
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto">
        <form onSubmit={submit} className="px-5 py-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Add User</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-muted text-muted">
              ✕
            </button>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-border px-4 py-3 text-base outline-none focus:border-primary"
              placeholder="Agent full name"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border px-4 py-3 text-base outline-none focus:border-primary"
              placeholder="agent@company.com"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">WhatsApp Number</label>
            <input
              type="tel"
              required
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="w-full rounded-xl border border-border px-4 py-3 text-base outline-none focus:border-primary"
              placeholder="+974 5000 0000"
            />
            <p className="text-[12px] text-muted mt-1">Other agents will use this to contact them directly.</p>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Temporary Password</label>
            <input
              type="text"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-border px-4 py-3 text-base outline-none focus:border-primary"
              placeholder="At least 6 characters"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Role</label>
            <div className="flex bg-surface-muted rounded-xl p-1 gap-1">
              {(["AGENT", "ADMIN"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 text-[13px] font-medium py-2.5 rounded-lg ${role === r ? "bg-surface shadow-sm" : "text-muted"}`}
                  style={role === r ? { color: "var(--primary)" } : undefined}
                >
                  {r === "AGENT" ? "Agent" : "Admin"}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="rounded-xl bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80 disabled:opacity-60 mt-1"
            style={{ background: "var(--primary)" }}
          >
            {submitting ? "Creating..." : "Create User"}
          </button>
        </form>
      </div>
    </div>
  );
}
