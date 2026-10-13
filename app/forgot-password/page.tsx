"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setSent(true);
      else setError((await res.json().catch(() => null))?.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-3xl font-bold tracking-tight">Reset your password</h1>
        {sent ? (
          <div className="mt-4 rounded-xl bg-surface-muted px-4 py-4 text-[15px]">
            If an account exists for <b>{email}</b>, we&apos;ve emailed a link to choose a new password. It works once and expires in 1 hour.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <p className="text-[15px] text-muted">Enter your account email and we&apos;ll send you a reset link.</p>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
              placeholder="you@company.com"
            />
            {error && <div className="rounded-xl bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>}
            <button type="submit" disabled={loading} className="w-full rounded-xl py-3.5 text-base font-semibold text-white disabled:opacity-60" style={{ background: "var(--primary)" }}>
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}
        <p className="text-center text-[13px] text-muted mt-5">
          <Link href="/login" className="font-semibold" style={{ color: "var(--primary)" }}>Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
