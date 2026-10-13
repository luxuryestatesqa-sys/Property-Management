"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listingCode } from "@/lib/format";

interface Viewing {
  id: string;
  scheduledAt: string;
  notes: string | null;
  status: "SCHEDULED" | "DONE" | "CANCELLED";
  lead: { id: string; name: string; phone: string | null };
  listing: { id: number; buildingName: string; community: string; area: string } | null;
  agent: { id: string; name: string } | null;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

// A "Add to Google Calendar" link: opens Google Calendar with the viewing already filled in (no sign-in
// needed here; the agent confirms it in their own calendar).
export function googleCalendarUrl(v: Viewing): string {
  const start = new Date(v.scheduledAt);
  const end = new Date(start.getTime() + 45 * 60000);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const place = v.listing ? `${listingCode(v.listing.id)} ${v.listing.buildingName}, ${v.listing.community}, ${v.listing.area}` : "";
  const q = new URLSearchParams({ action: "TEMPLATE", text: `Viewing: ${v.lead.name}${v.listing ? ` · ${v.listing.buildingName}` : ""}`, dates: `${f(start)}/${f(end)}`, details: `${v.lead.phone ? `Client phone: ${v.lead.phone}\n` : ""}${v.notes ?? ""}`, location: place });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

function localInput(offsetHours: number): string {
  const d = new Date(Date.now() + offsetHours * 3600_000);
  d.setMinutes(0, 0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// Upcoming viewings for a lead (with a booking form) or for a property (read-only list).
export default function ViewingsCard({ leadId, listingId, defaultListing, agents, onBooked }: { leadId?: string; listingId?: number; defaultListing?: { id: number; label: string } | null; agents?: { id: string; name: string }[]; onBooked?: () => void }) {
  const [items, setItems] = useState<Viewing[] | null>(null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(localInput(24));
  const [property, setProperty] = useState("");
  const [agentId, setAgentId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const q = leadId ? `leadId=${encodeURIComponent(leadId)}` : listingId ? `listingId=${listingId}` : "";
    if (!q) return;
    const res = await fetch(`/api/viewings?${q}`);
    if (res.ok) setItems((await res.json()).viewings);
  }, [leadId, listingId]);

  useEffect(() => {
    load();
  }, [load]);

  async function book(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/viewings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, listingId: property.trim() || defaultListing?.id || null, agentId: agentId || undefined, scheduledAt: new Date(at).toISOString(), notes }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => null))?.error ?? "Couldn't book the viewing");
    setOpen(false);
    setNotes("");
    setProperty("");
    await load();
    onBooked?.();
  }

  async function setStatus(id: string, status: Viewing["status"]) {
    await fetch(`/api/viewings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await load();
    onBooked?.();
  }

  const upcoming = (items ?? []).filter((v) => v.status === "SCHEDULED" && new Date(v.scheduledAt).getTime() >= Date.now() - 3600_000);
  const past = (items ?? []).filter((v) => !upcoming.includes(v)).slice(-3).reverse();
  const field = "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14px] outline-none";

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-medium">Viewings</h2>
        {leadId && !open && (
          <button type="button" onClick={() => setOpen(true)} className="rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--primary)" }}>
            Schedule viewing
          </button>
        )}
      </div>

      {open && leadId && (
        <form onSubmit={book} className="mb-4 flex flex-col gap-3 rounded-xl bg-surface-muted p-3.5">
          <div>
            <label className="mb-1 block text-[12.5px] font-medium text-muted">Date and time</label>
            <input type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-[12.5px] font-medium text-muted">Property</label>
            <input value={property} onChange={(e) => setProperty(e.target.value)} placeholder={defaultListing ? `${defaultListing.label} (linked)` : "e.g. LST-000085"} className={field} />
          </div>
          {agents && agents.length > 0 && (
            <div>
              <label className="mb-1 block text-[12.5px] font-medium text-muted">Agent</label>
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={field}>
                <option value="">Me</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-[12.5px] font-medium text-muted">Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. meet at the lobby" className={field} />
          </div>
          {error && <p className="text-[12.5px] text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-surface px-4 py-2 text-[13px] font-semibold hover:bg-border">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-xl px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--primary)" }}>
              {busy ? "Booking…" : "Book viewing"}
            </button>
          </div>
        </form>
      )}

      {items === null ? (
        <div className="h-10 animate-pulse rounded-xl bg-surface-muted" />
      ) : upcoming.length === 0 && past.length === 0 ? (
        <p className="text-[13px] text-muted">{leadId ? "No viewings booked yet." : "No viewings booked for this property."}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {[...upcoming, ...past].map((v) => (
            <li key={v.id} className={`rounded-xl border border-border bg-surface-elevated px-3.5 py-3 ${v.status === "SCHEDULED" ? "" : "opacity-70"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="tnum text-[14px] font-semibold text-text">{when(v.scheduledAt)}</div>
                  <div className="mt-0.5 truncate text-[12.5px] text-muted">
                    {leadId ? null : (
                      <Link href={`/leads/${v.lead.id}`} className="font-medium text-text-body hover:text-primary">
                        {v.lead.name}
                      </Link>
                    )}
                    {leadId && v.listing && (
                      <Link href={`/property/${v.listing.id}`} className="font-medium text-text-body hover:text-primary">
                        {listingCode(v.listing.id)} · {v.listing.buildingName}
                      </Link>
                    )}
                    {v.agent ? ` · ${v.agent.name}` : ""}
                  </div>
                  {v.notes && <div className="mt-1 text-[12.5px] text-muted">{v.notes}</div>}
                </div>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={v.status === "DONE" ? { background: "var(--success-soft)", color: "var(--success)" } : v.status === "CANCELLED" ? { background: "var(--danger-soft)", color: "var(--danger)" } : { background: "var(--primary-soft)", color: "var(--primary)" }}>
                  {v.status === "SCHEDULED" ? "Booked" : v.status === "DONE" ? "Done" : "Cancelled"}
                </span>
              </div>
              {v.status === "SCHEDULED" && (
                <div className="mt-2.5 flex flex-wrap gap-2 text-[12.5px] font-semibold">
                  <a href={googleCalendarUrl(v)} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-surface-muted px-3 py-1.5 hover:bg-border">
                    Add to Google Calendar
                  </a>
                  <button type="button" onClick={() => setStatus(v.id, "DONE")} className="rounded-lg bg-surface-muted px-3 py-1.5 hover:bg-border">
                    Mark done
                  </button>
                  <button type="button" onClick={() => setStatus(v.id, "CANCELLED")} className="rounded-lg bg-surface-muted px-3 py-1.5 text-danger hover:bg-border">
                    Cancel
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
