"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { resizeImageFile } from "@/lib/image";
import { extractErrorMessage } from "@/lib/errors";

interface Org {
  name: string;
  logoUrl: string | null;
}

// Admin-only: the agency's name and logo, shown across the app
// (sidebar, share pages, WhatsApp texts, feeds).
export default function AgencyBrandingCard() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/org")
      .then((r) => r.json())
      .then((d: { org: Org | null }) => {
        if (d.org) {
          setName(d.org.name);
          setLogo(d.org.logoUrl);
        }
      })
      .catch(() => setMessage({ ok: false, text: "Couldn't load agency details" }))
      .finally(() => setLoaded(true));
  }, []);

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage({ ok: false, text: "Please choose an image file" });
      return;
    }
    try {
      setLogo(await resizeImageFile(file, 256, 0.9));
      setMessage(null);
    } catch {
      setMessage({ ok: false, text: "Couldn't read that image" });
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, logoUrl: logo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage({ ok: false, text: extractErrorMessage(data?.error, "Couldn't save") });
        return;
      }
      setMessage({ ok: true, text: "Saved. Your branding is live across the app." });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-4 lg:p-5">
      <div>
        <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide">Agency Branding</h3>
        <p className="text-[12.5px] text-muted mt-1">Your name and logo appear in the sidebar, shared listing pages and messages.</p>
      </div>

      <div>
        <label className="text-sm font-medium block mb-1.5">Agency name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!loaded}
          required
          maxLength={60}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-primary"
        />
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <div>
          <label className="text-sm font-medium block mb-1.5">Logo</label>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl border border-border bg-white flex items-center justify-center overflow-hidden">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-[11px] text-muted">None</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg bg-surface-muted px-3 py-2 text-[13px] font-semibold hover:opacity-80">
                {logo ? "Change" : "Upload"}
              </button>
              {logo && (
                <button type="button" onClick={() => setLogo(null)} className="text-[12px] text-danger text-left">
                  Remove
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={pickLogo} className="hidden" />
          </div>
        </div>

      </div>

      {message && (
        <div className={`rounded-xl px-4 py-3 text-sm ${message.ok ? "bg-success-bg" : "bg-danger-bg text-danger"}`} style={message.ok ? { color: "var(--success)" } : undefined}>
          {message.text}
        </div>
      )}

      <button
        type="submit"
        disabled={saving || !loaded}
        className="self-start rounded-xl px-5 py-2.5 text-[14px] font-semibold text-white active:opacity-80 disabled:opacity-60"
        style={{ background: "var(--primary)" }}
      >
        {saving ? "Saving..." : "Save branding"}
      </button>
    </form>
  );
}
