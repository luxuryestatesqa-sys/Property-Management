"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import { useOrg } from "@/components/OrgProvider";
import { buildWhatsAppLeadMessage } from "@/lib/whatsapp";
import { timeAgo, fullDateTime } from "@/lib/timeAgo";
import { formatQAR, formatSqm, listingCode } from "@/lib/format";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS } from "@/lib/propertyCategory";
import { CHANNEL_LABELS, LeadStageDTO, SOURCE_LABELS } from "@/components/leads/leadTypes";
import { IconChevronLeft, IconPin } from "@/components/desktop/icons";

interface Activity {
  id: string;
  type: string;
  text: string | null;
  createdAt: string;
  user: { id: string; name: string; avatarUrl: string | null } | null;
}

interface Detail {
  lead: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    whatsappUsername: string | null;
    source: keyof typeof SOURCE_LABELS;
    channel: keyof typeof CHANNEL_LABELS;
    entityType: string | null;
    pfStatus: string | null;
    responseLink: string | null;
    region: string | null;
    listingReference: string | null;
    stageId: string;
    stage: LeadStageDTO;
    assignedTo: { id: string; name: string; avatarUrl: string | null; whatsapp: string } | null;
    receivedAt: string;
    firstContactedAt: string | null;
    callTalkTime: number | null;
    callWaitTime: number | null;
    callRecordUrl: string | null;
    tags: string[];
    sellerProperty: Record<string, unknown> | null;
    activities: Activity[];
    listing: {
      id: number;
      buildingName: string;
      area: string;
      community: string;
      listingType: "RENT" | "SALE";
      rentPrice: number | null;
      salePrice: number | null;
      propertyCategory: keyof typeof PROPERTY_CATEGORY_LABELS;
      bedrooms: keyof typeof BEDROOM_SHORT_LABELS | null;
      sizeSqm: number | null;
      cover: string | null;
    } | null;
  };
  stages: LeadStageDTO[];
  agents: { id: string; name: string; avatarUrl: string | null }[];
  related: { id: string; name: string; receivedAt: string; listingReference: string | null; stage: { name: string; color: string | null } }[];
  canManage: boolean;
}

const TIMELINE: Record<string, { label: string; color: string; icon: string }> = {
  RECEIVED: { label: "Lead received", color: "#6366f1", icon: "M12 5v14M5 12l7 7 7-7" },
  ASSIGNED: { label: "Assigned", color: "#0ea5e9", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M19 8v6M22 11h-6" },
  UNASSIGNED: { label: "Unassigned", color: "#d97706", icon: "M12 9v4M12 17h.01" },
  STAGE_CHANGED: { label: "Stage changed", color: "#8b5cf6", icon: "M5 12h14M13 6l6 6-6 6" },
  PF_STATUS: { label: "Property Finder", color: "#64748b", icon: "M3 12h4l3 8 4-16 3 8h4" },
  NOTE: { label: "Note", color: "#f59e0b", icon: "M4 4h16v12H8l-4 4zM8 9h8M8 12.5h5" },
  CALL_LOGGED: { label: "Call", color: "#10b981", icon: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" },
  WHATSAPP_LOGGED: { label: "WhatsApp", color: "#16a34a", icon: "M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
  VIEWING_BOOKED: { label: "Viewing", color: "#f59e0b", icon: "M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5" },
};

function duration(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60} min`;
  return `${Math.round(h / 24)} d`;
}

const card = "rounded-2xl border border-border bg-surface shadow-sm p-5";
const label = "text-[12px] font-medium text-muted";

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const org = useOrg();
  const [data, setData] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await fetch(`/api/leads/${id}`);
    if (res.status === 404) return setMissing(true);
    if (res.ok) setData(await res.json());
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setError("");
    const res = await fetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) setError((await res.json().catch(() => null))?.error ?? "Couldn't save that change");
    await load();
  }

  async function log(type: string, text?: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/leads/${id}/activities`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, text }) });
      if (!res.ok) setError((await res.json().catch(() => null))?.error ?? "Couldn't save");
      else {
        if (type === "NOTE") setNote("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  if (missing)
    return (
      <div className="px-4 py-20 text-center text-muted">
        <p>Lead not found.</p>
        <Link href="/leads" className="font-semibold" style={{ color: "var(--primary)" }}>
          Back to Leads
        </Link>
      </div>
    );
  if (!data)
    return (
      <div className="px-4 pt-10 lg:px-0">
        <div className="h-8 w-48 animate-pulse rounded bg-surface-muted" />
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="h-96 animate-pulse rounded-2xl bg-surface-muted" />
          <div className="h-96 animate-pulse rounded-2xl bg-surface-muted" />
        </div>
      </div>
    );

  const { lead, stages, agents, related, canManage } = data;
  const digits = lead.phone?.replace(/[^\d]/g, "");
  const wa = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(buildWhatsAppLeadMessage(lead.name, org.name, lead.listing?.buildingName ?? null))}` : null;
  const color = lead.stage.color ?? "#6366f1";
  const responseMs = lead.firstContactedAt ? new Date(lead.firstContactedAt).getTime() - new Date(lead.receivedAt).getTime() : null;
  const listing = lead.listing;

  return (
    <div className="px-4 pb-24 lg:px-0 lg:pb-12 page-in">
      <div className="pt-4 lg:pt-8">
        <div className="mb-4 flex items-center gap-2 text-[13px] text-muted">
          <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-1 font-medium transition-colors hover:text-slate-900">
            <IconChevronLeft size={15} />
            Back
          </button>
          <span className="text-slate-300">/</span>
          <Link href="/leads" className="transition-colors hover:text-slate-900">
            Leads
          </Link>
        </div>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-light text-[22px] font-semibold text-primary">{lead.name.trim().charAt(0).toUpperCase()}</span>
            <div className="min-w-0">
              <h1 className="truncate text-[24px] font-semibold leading-tight tracking-[-0.02em] lg:text-[28px]">{lead.name}</h1>
              <p className="mt-0.5 text-[14px] text-muted">
                {SOURCE_LABELS[lead.source]} · {CHANNEL_LABELS[lead.channel]} · received {timeAgo(lead.receivedAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => log("WHATSAPP_LOGGED")} className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[14px] font-semibold" style={{ background: "#e7f9ee", color: "#1a7f3c" }}>
                WhatsApp
              </a>
            )}
            {lead.phone && (
              <a href={`tel:${lead.phone}`} onClick={() => log("CALL_LOGGED")} className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[14px] font-semibold text-white" style={{ background: "var(--primary)" }}>
                Call
              </a>
            )}
          </div>
        </div>
      </div>

      {error && <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-[13.5px] text-danger">{error}</div>}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        {/* Main: pipeline, quick log, timeline */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* Stage stepper */}
          <div className={card}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Stage</h2>
              <span className="rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: `color-mix(in srgb, ${color} 14%, white)`, color }}>
                {lead.stage.name}
              </span>
            </div>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {stages.map((s) => {
                const on = s.id === lead.stageId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => !on && patch({ stageId: s.id })}
                    className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${on ? "text-white" : "bg-surface-muted text-slate-600 hover:bg-border"}`}
                    style={on ? { background: s.color ?? "#6366f1" } : undefined}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timeline */}
          <div className={card}>
            <h2 className="text-[15px] font-semibold">Activity</h2>
            <div className="mt-4 rounded-xl border border-border bg-surface-muted/40 p-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note: what was discussed, budget, next step…"
                rows={3}
                maxLength={2000}
                data-bare
                className="w-full resize-none bg-transparent text-[14.5px] outline-none"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {[["CALL_LOGGED", "Log a call"], ["WHATSAPP_LOGGED", "Log WhatsApp"], ["VIEWING_BOOKED", "Viewing booked"]].map(([t, l]) => (
                    <button key={t} type="button" disabled={busy} onClick={() => log(t, note.trim() || undefined)} className="rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-600 shadow-sm ring-1 ring-border transition-colors hover:bg-slate-50 disabled:opacity-60">
                      {l}
                    </button>
                  ))}
                </div>
                <button type="button" disabled={busy || !note.trim()} onClick={() => log("NOTE", note)} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--primary)" }}>
                  Save note
                </button>
              </div>
            </div>

            <ol className="mt-6">
              {lead.activities.map((a, i) => {
                const t = TIMELINE[a.type] ?? { label: a.type, color: "#64748b", icon: "M12 5v14" };
                return (
                  <li key={a.id} className="relative flex gap-3.5 pb-6 last:pb-0">
                    {i < lead.activities.length - 1 && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-slate-200" />}
                    <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${t.color} 15%, white)`, color: t.color }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d={t.icon} />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-[13.5px] font-semibold">{t.label}</span>
                        <span className="text-[12px] text-muted" title={fullDateTime(a.createdAt)}>
                          {timeAgo(a.createdAt)}
                        </span>
                      </div>
                      {a.text && <p className="mt-0.5 whitespace-pre-line text-[14px] leading-relaxed text-foreground/85">{a.text}</p>}
                      {a.user && <p className="mt-1 text-[12px] text-muted">by {a.user.name}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* Side */}
        <div className="flex flex-col gap-5">
          <div className={card}>
            <h2 className="mb-3.5 text-[15px] font-semibold">Contact</h2>
            <dl className="flex flex-col gap-3 text-[14px]">
              <div>
                <dt className={label}>Phone</dt>
                <dd className="mt-0.5 font-medium">{lead.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className={label}>Email</dt>
                <dd className="mt-0.5 break-all font-medium">{lead.email ?? "—"}</dd>
              </div>
              {lead.region && (
                <div>
                  <dt className={label}>Region</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
                    <IconPin size={14} className="text-muted" />
                    {lead.region}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className={card}>
            <h2 className="mb-3.5 text-[15px] font-semibold">Assigned agent</h2>
            {canManage ? (
              <select
                value={lead.assignedTo?.id ?? ""}
                onChange={(e) => patch({ assignedToId: e.target.value || null })}
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14px] outline-none"
              >
                <option value="">Unassigned</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            ) : lead.assignedTo ? (
              <div className="flex items-center gap-2.5">
                <Avatar name={lead.assignedTo.name} avatarUrl={lead.assignedTo.avatarUrl} size={32} />
                <span className="text-[14px] font-medium">{lead.assignedTo.name}</span>
              </div>
            ) : null}
            <div className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3 text-[13px]">
              {responseMs !== null ? (
                <span>
                  First response in <b>{duration(responseMs)}</b>
                </span>
              ) : (
                <span className="text-amber-800">
                  Waiting for a response for <b>{duration(now - new Date(lead.receivedAt).getTime())}</b>
                </span>
              )}
            </div>
          </div>

          {listing && (
            <Link href={`/property/${listing.id}`} className="group block overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-md">
              {listing.cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={listing.cover} alt="" className="aspect-[16/9] w-full object-cover" />
              )}
              <div className="p-5">
                <div className="text-[12px] font-medium text-muted">Enquired about</div>
                <div className="mt-0.5 text-[16px] font-semibold group-hover:text-primary">{listing.buildingName}</div>
                <div className="mt-0.5 text-[13px] text-muted">
                  {listing.area} → {listing.community} · {listingCode(listing.id)}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-foreground/80">
                  <span className="tnum font-semibold">
                    {formatQAR(listing.listingType === "RENT" ? listing.rentPrice : listing.salePrice)}
                    {listing.listingType === "RENT" ? "/mo" : ""}
                  </span>
                  <span>{PROPERTY_CATEGORY_LABELS[listing.propertyCategory]}</span>
                  {listing.bedrooms && <span>{BEDROOM_SHORT_LABELS[listing.bedrooms]}</span>}
                  {listing.sizeSqm && <span>{formatSqm(listing.sizeSqm)}</span>}
                </div>
              </div>
            </Link>
          )}

          {lead.channel === "CALL" && (lead.callTalkTime !== null || lead.callRecordUrl) && (
            <div className={card}>
              <h2 className="mb-3.5 text-[15px] font-semibold">Call details</h2>
              <div className="grid grid-cols-2 gap-3 text-[14px]">
                <div>
                  <div className={label}>Talk time</div>
                  <div className="mt-0.5 font-medium">{lead.callTalkTime !== null ? `${Math.floor(lead.callTalkTime / 60)}m ${lead.callTalkTime % 60}s` : "—"}</div>
                </div>
                <div>
                  <div className={label}>Waited</div>
                  <div className="mt-0.5 font-medium">{lead.callWaitTime !== null ? `${lead.callWaitTime}s` : "—"}</div>
                </div>
              </div>
              {lead.callRecordUrl && <audio controls preload="none" src={lead.callRecordUrl} className="mt-4 w-full" />}
            </div>
          )}

          {lead.sellerProperty && (
            <div className={card}>
              <h2 className="mb-3.5 text-[15px] font-semibold">Seller&apos;s property</h2>
              <dl className="flex flex-col gap-2 text-[13.5px]">
                {Object.entries(lead.sellerProperty)
                  .filter(([, v]) => v !== null && v !== undefined && v !== "" && typeof v !== "object")
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt className="capitalize text-muted">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
                      <dd className="text-right font-medium">{String(v)}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}

          {related.length > 0 && (
            <div className={card}>
              <h2 className="mb-3 text-[15px] font-semibold">Other enquiries from this number</h2>
              <ul className="flex flex-col gap-2.5">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/leads/${r.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-slate-50">
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{r.listingReference ?? "Enquiry"}</span> <span className="text-muted">· {timeAgo(r.receivedAt)}</span>
                      </span>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${r.stage.color ?? "#6366f1"} 14%, white)`, color: r.stage.color ?? "#6366f1" }}>
                        {r.stage.name}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="px-1 text-[12px] text-muted">
            Property Finder status: <b>{lead.pfStatus ?? "—"}</b> · Received {fullDateTime(lead.receivedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}
