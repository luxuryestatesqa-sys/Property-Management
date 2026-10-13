"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      const role = (await (await fetch("/api/auth/session")).json())?.user?.role;
      if (role === "OWNER" || role === "ADMIN") home = "/dashboard";
    } catch {}
    router.push(searchParams.get("callbackUrl") ?? home);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10 lg:grid lg:grid-cols-[1.1fr_1fr] lg:p-0">
      <aside className="hidden lg:flex flex-col justify-between p-14 text-white" style={{ background: "var(--gradient-primary)" }}>
        <div className="text-[18px] font-semibold tracking-tight">Listings Portal</div>
        <div>
          <h2 className="text-4xl font-bold leading-tight tracking-tight max-w-md">
            Every listing, every agent, one workspace.
          </h2>
          <p className="mt-4 text-[16px] max-w-md leading-relaxed" style={{ color: "rgba(255,255,255,0.78)" }}>
            Search the whole company inventory, manage your own properties and publish to portals in a few clicks.
          </p>
        </div>
        <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.6)" }}>Agent Listings Portal</p>
      </aside>
      <div className="mx-auto w-full max-w-sm lg:max-w-md lg:flex lg:flex-col lg:justify-center lg:px-10">
        <div className="flex flex-col items-center mb-8 lg:hidden">
          <p className="text-xl font-bold">Listings Portal</p>
          <p className="text-sm text-muted">Agent sign in</p>
        </div>
        <div className="hidden lg:block mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-[15px] text-muted mt-1.5">Sign in to your agent account to continue.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Email</label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80 disabled:opacity-60"
            style={{ background: "var(--primary)" }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-[13px] text-muted mt-5">
          <Link href="/forgot-password" className="font-semibold" style={{ color: "var(--primary)" }}>
            Forgot your password?
          </Link>
        </p>
        {process.env.NEXT_PUBLIC_ALLOW_SIGNUP !== "false" && (
          <p className="text-center text-[13px] text-muted mt-3">
            New agency?{" "}
            <Link href="/signup" className="font-semibold" style={{ color: "var(--primary)" }}>
              Create an account
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
