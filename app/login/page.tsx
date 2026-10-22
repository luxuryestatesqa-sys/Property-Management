"use client";

import { safeCallbackPath } from "@/lib/safeRedirect";
import { can } from "@/lib/permissions";
import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password, or your account is inactive.");
      return;
    }
    // Admins land on the dashboard; everyone else on the property search (unless they were sent here from a page).
    let home = "/";
    try {
      const sessionUser = (await (await fetch("/api/auth/session")).json())?.user;
      if (can(sessionUser, "dashboard.view")) home = "/dashboard";
    } catch {}
    router.push(safeCallbackPath(searchParams.get("callbackUrl"), home));
    router.refresh();
  }

  return (
    <AuthShell
      headline="Every listing, every agent, one workspace."
      points={[
        "Search the whole company inventory",
        "Manage your own properties and leads",
        "Publish to portals in a few clicks",
      ]}
      footnote="Agent Listings Portal"
    >
      <div className="mb-7">
        <h1 className="text-[28px] font-bold tracking-tight" style={{ color: "var(--primary-dark)" }}>Welcome back</h1>
        <p className="text-[15px] text-muted mt-1.5">Sign in to your agent account to continue.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="text-sm font-medium text-foreground block mb-1.5">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-border px-4 py-3.5 text-base outline-none"
            placeholder="you@company.com"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
            <Link href="/forgot-password" className="text-[13px] font-semibold" style={{ color: "var(--primary)" }}>
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-border px-4 py-3.5 pr-16 text-base outline-none"
              placeholder="Enter your password"
            />
            <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-xl bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80 disabled:opacity-60"
          style={{ background: "var(--primary)" }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {process.env.NEXT_PUBLIC_ALLOW_SIGNUP !== "false" && (
        <p className="text-center text-[14px] text-muted mt-7 pt-6 border-t border-border">
          New agency?{" "}
          <Link href="/signup" className="font-semibold" style={{ color: "var(--primary)" }}>
            Create an account
          </Link>
        </p>
      )}
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
