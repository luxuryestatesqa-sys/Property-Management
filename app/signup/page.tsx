"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { extractErrorMessage } from "@/lib/errors";
import AuthShell from "@/components/AuthShell";

const input = "w-full rounded-xl border border-border px-4 py-3 text-[15px] outline-none";

export default function SignupPage() {
  const router = useRouter();
  const [agencyName, setAgencyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot, left empty by real users
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyName, name, email, whatsapp, password, website }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(extractErrorMessage(data?.error, "Couldn't create your account"));
        return;
      }
      const login = await signIn("credentials", { email, password, redirect: false });
      if (login?.error) {
        router.push("/login");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      wide
      headline="Run your whole agency from one place."
      points={[
        "Manage listings and publish to property portals",
        "Capture, assign and follow up on leads",
        "Give every agent their own login and role",
      ]}
      footnote="Your agency's data is private to your agency."
    >
        <div className="mb-5">
          <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "var(--primary-dark)" }}>Create your agency account</h1>
          <p className="text-[15px] text-muted mt-1.5">You&apos;ll be the owner and can invite your team afterwards.</p>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-[13px] font-medium block mb-1">Agency name</label>
            <input required value={agencyName} onChange={(e) => setAgencyName(e.target.value)} className={input} placeholder="Your Agency Real Estate" maxLength={60} />
          </div>
          <div>
            <label className="text-[13px] font-medium block mb-1">Your name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={input} autoComplete="name" />
          </div>
          <div>
            <label className="text-[13px] font-medium block mb-1">Email</label>
            <input required type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} autoComplete="username" placeholder="you@company.com" />
          </div>
          <div>
            <label className="text-[13px] font-medium block mb-1">WhatsApp number</label>
            <input required type="tel" autoComplete="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className={input} placeholder="e.g. +974 5000 0000" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[13px] font-medium block mb-1">Password</label>
            <div className="relative">
              <input required type={showPassword ? "text" : "password"} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} pr-16`} autoComplete="new-password" placeholder="At least 8 characters" />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {/* honeypot */}
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden="true" name="website" />

          {error && <div className="sm:col-span-2 rounded-xl bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>}

          <button type="submit" disabled={loading} className="sm:col-span-2 mt-1 w-full rounded-xl py-3 text-base font-semibold text-white active:opacity-80 disabled:opacity-60" style={{ background: "var(--primary)" }}>
            {loading ? "Creating..." : "Create agency"}
          </button>
        </form>

        <p className="text-center text-[14px] text-muted mt-5 pt-5 border-t border-border">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold" style={{ color: "var(--primary)" }}>
            Sign in
          </Link>
        </p>
    </AuthShell>
  );
}
