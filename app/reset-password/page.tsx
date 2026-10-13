"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function ResetForm() {
  const params = useSearchParams();
  // "token" = our own emailed link; "oobCode" = the link in Firebase's reset email.
  const token = params.get("token") ?? "";
  const oobCode = params.get("oobCode") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("The two passwords don't match.");
    setLoading(true);
    try {
      const res = await fetch("/api/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(oobCode ? { oobCode, password } : { token, password }),
      });
      if (res.ok) setDone(true);
      else setError((await res.json().catch(() => null))?.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  const input = "w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary";
  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-3xl font-bold tracking-tight">Choose a new password</h1>
        {done ? (
          <div className="mt-4 flex flex-col gap-4">
            <div className="rounded-xl bg-surface-muted px-4 py-4 text-[15px]">Your password has been changed. You can sign in now.</div>
            <Link href="/login" className="w-full rounded-xl py-3.5 text-center text-base font-semibold text-white" style={{ background: "var(--primary)" }}>Go to sign in</Link>
          </div>
        ) : !token && !oobCode ? (
          <p className="mt-4 text-[15px] text-muted">
            This link is incomplete. <Link href="/forgot-password" className="font-semibold" style={{ color: "var(--primary)" }}>Request a new one</Link>.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} placeholder="New password (min 6 characters)" />
            <input type="password" required minLength={6} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} placeholder="Repeat new password" />
            {error && <div className="rounded-xl bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>}
            <button type="submit" disabled={loading} className="w-full rounded-xl py-3.5 text-base font-semibold text-white disabled:opacity-60" style={{ background: "var(--primary)" }}>
              {loading ? "Saving..." : "Change password"}
            </button>
            <p className="text-center text-[13px] text-muted">
              Link expired? <Link href="/forgot-password" className="font-semibold" style={{ color: "var(--primary)" }}>Request a new one</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
