"use client";

import { useState } from "react";
import { generateTempPassword } from "@/lib/password";
import { extractErrorMessage } from "@/lib/errors";
import WhatsAppButton from "./WhatsAppButton";

interface ResetPasswordModalProps {
  user: { id: string; name: string; whatsapp: string };
  onClose: () => void;
}

export default function ResetPasswordModal({ user, onClose }: ResetPasswordModalProps) {
  const [password, setPassword] = useState(() => generateTempPassword());
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(extractErrorMessage(data.error, "Failed to reset password"));
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable — the password is still visible to copy manually
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto">
        {!done ? (
          <form onSubmit={submit} className="px-5 py-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Reset Password</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-muted text-muted">
                ✕
              </button>
            </div>
            <p className="text-sm text-muted -mt-2">
              Set a new temporary password for <span className="font-semibold text-foreground">{user.name}</span>. They can
              change it themselves afterward from Profile.
            </p>

            <div>
              <label className="text-sm font-medium block mb-1.5">New Password</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 min-w-0 rounded-xl border border-border px-4 py-3 text-base outline-none focus:border-primary font-mono"
                />
                <button
                  type="button"
                  onClick={() => setPassword(generateTempPassword())}
                  aria-label="Generate a new random password"
                  className="shrink-0 w-12 rounded-xl bg-surface-muted flex items-center justify-center active:opacity-70"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 4v6h-6M1 20v-6h6" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                </button>
              </div>
              <p className="text-[12px] text-muted mt-1.5">A random password is suggested — edit it or tap the icon for a new one.</p>
            </div>

            {error && <div className="rounded-xl bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80 disabled:opacity-60 mt-1"
              style={{ background: "var(--primary)" }}
            >
              {submitting ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        ) : (
          <div className="px-5 py-6 flex flex-col gap-4">
            <div className="flex flex-col items-center text-center pt-2">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl mb-3" style={{ background: "var(--success-bg)" }}>
                ✅
              </div>
              <h2 className="text-lg font-bold">Password Reset</h2>
              <p className="text-sm text-muted mt-1">
                Share this new password with <span className="font-semibold text-foreground">{user.name}</span>.
              </p>
            </div>

            <div className="rounded-xl bg-surface-muted px-4 py-3.5 flex items-center justify-between gap-2">
              <span className="font-mono text-lg font-semibold tracking-wide">{password}</span>
              <button
                type="button"
                onClick={copyPassword}
                className="shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-surface active:opacity-70"
                style={{ color: "var(--primary)" }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <WhatsAppButton
              number={user.whatsapp}
              message={`Hi ${user.name}, your Luxury Estates account password has been reset. Your new temporary password is: ${password}\n\nPlease log in and change it from Profile.`}
              variant="full"
              className="w-full justify-center py-3.5"
            />

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80"
              style={{ background: "var(--primary)" }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
