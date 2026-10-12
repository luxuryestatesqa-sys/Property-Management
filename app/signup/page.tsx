"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { extractErrorMessage } from "@/lib/errors";

const input = "w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary";

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
    <div className="min-h-screen flex flex-col justify-center px-6 py-10 lg:grid lg:grid-cols-[1.1fr_1fr] lg:p-0">
      <aside className="hidden lg:flex flex-col justify-between p-14 text-white" style={{ background: "linear-gradient(160deg, #14181f 0%, #231d0e 100%)" }}>
        <div className="text-[18px] font-semibold tracking-tight">Listings Portal</div>
        <div>
          <h2 className="text-4xl font-bold leading-tight tracking-tight max-w-md">Run your whole agency from one place.</h2>
          <ul className="mt-6 flex flex-col gap-3 text-[16px] max-w-md" style={{ color: "#b9b4a4" }}>
            <li>Manage listings and publish to property portals</li>
            <li>Capture, assign and follow up on leads</li>
            <li>Give every agent their own login and role</li>
          </ul>
        </div>
        <p className="text-[13px]" style={{ color: "#8d8878" }}>Your agency&apos;s data is private to your agency.</p>
      </aside>

      <div className="mx-auto w-full max-w-sm lg:max-w-md lg:flex lg:flex-col lg:justify-center lg:px-10">
        <div className="mb-7">
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Create your agency account</h1>
          <p className="text-[15px] text-muted mt-1.5">You&apos;ll be the owner and can invite your team afterwards.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium block mb-1.5">Agency name</label>
            <input required value={agencyName} onChange={(e) => setAgencyName(e.target.value)} className={input} placeholder="Your Agency Real Estate" maxLength={60} />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Your name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={input} autoComplete="name" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Email</label>
            <input required type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} autoComplete="username" placeholder="you@company.com" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">WhatsApp number</label>
            <input required type="tel" autoComplete="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className={input} placeholder="+974 5000 0000" />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Password</label>
            <div className="relative">
              <input required type={showPassword ? "text" : "password"} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} pr-16`} autoComplete="new-password" placeholder="At least 8 characters" />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {/* honeypot */}
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden="true" name="website" />

          {error && <div className="rounded-xl bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>}

          <button type="submit" disabled={loading} className="mt-1 w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80 disabled:opacity-60" style={{ background: "var(--primary)" }}>
            {loading ? "Creating..." : "Create agency"}
          </button>
        </form>

        <p className="text-center text-[13px] text-muted mt-5">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold" style={{ color: "var(--primary)" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
