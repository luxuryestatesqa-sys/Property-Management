"use client";

import { qatarDayDiff } from "@/lib/qatarTime";
import { LeadRow, LeadStageDTO, CHANNEL_LABELS, SOURCE_LABELS } from "./leadTypes";
import { timeAgo, fullDateTime } from "@/lib/timeAgo";
import { buildWhatsAppLeadMessage } from "@/lib/whatsapp";
import { useOrg } from "../OrgProvider";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function ChannelIcon({ channel }: { channel: LeadRow["channel"] }) {
  if (channel === "CALL")
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" {...stroke}>
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
      </svg>
    );
  if (channel === "FORM")
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" {...stroke}>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </svg>
    );
  if (channel === "EMAIL")
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" {...stroke}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    );
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21c5.46 0 9.9-4.44 9.9-9.9S17.5 2 12.04 2Z" />
    </svg>
  );
}

// Source + channel, e.g. "Property Finder · WhatsApp".
export function SourceBadge({ lead }: { lead: LeadRow }) {
  const tone =
    lead.channel === "WHATSAPP" ? { bg: "var(--success-soft)", fg: "var(--success)" } : lead.channel === "CALL" ? { bg: "var(--primary-soft)", fg: "var(--primary)" } : lead.channel === "FORM" ? { bg: "var(--primary-soft)", fg: "var(--primary)" } : { bg: "var(--surface-muted)", fg: "var(--muted)" };
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="whitespace-nowrap text-[12.5px] font-medium text-foreground">{lead.sourceLabel && lead.sourceLabel !== "Import" ? lead.sourceLabel : lead.source === "IMPORT" ? "Unknown" : SOURCE_LABELS[lead.source]}</span>
      {lead.channel !== "OTHER" && (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tone.bg, color: tone.fg }}>
          <ChannelIcon channel={lead.channel} />
          {CHANNEL_LABELS[lead.channel]}
        </span>
      )}
    </div>
  );
}

// The lead's next open follow-up, in Qatar time: red when overdue, amber when due today.
export function FollowUpTag({ iso }: { iso: string | null }) {
  if (!iso) return null;
  const due = new Date(iso);
  const overdue = due.getTime() < Date.now();
  const today = !overdue && qatarDayDiff(due) === 0;
  const time = due.toLocaleTimeString("en-GB", { timeZone: "Asia/Qatar", hour: "numeric", minute: "2-digit", hour12: true });
  const date = due.toLocaleDateString("en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "short" });
  const tone = overdue ? { background: "var(--danger-soft)", color: "var(--danger)" } : today ? { background: "var(--warning-soft)", color: "var(--warning)" } : { background: "var(--background)", color: "var(--text-muted)" };
  return (
    <span title={`Next follow-up: ${date}, ${time} (Qatar time)`} className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold leading-none" style={tone}>
      {overdue ? `Overdue · ${date}` : today ? `Today ${time}` : `Follow-up ${date}`}
    </span>
  );
}

export function ReceivedAt({ iso }: { iso: string }) {
  return (
    <div title={fullDateTime(iso)} className="whitespace-nowrap">
      <div className="text-[13px] font-medium text-foreground">{timeAgo(iso)}</div>
      <div className="text-[11.5px] text-muted">{new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}</div>
    </div>
  );
}

export function StageSelect({ lead, stages, onChange, compact }: { lead: LeadRow; stages: LeadStageDTO[]; onChange: (stageId: string) => void; compact?: boolean }) {
  const cur = stages.find((s) => s.id === lead.stageId);
  const color = cur?.color ?? "var(--primary)";
  return (
    <div className="relative inline-block">
      <select
        value={lead.stageId}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Lead stage"
        onClick={(e) => e.stopPropagation()}
        className={`cursor-pointer appearance-none rounded-full font-semibold outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary ${compact ? "py-1 pl-2.5 pr-6 text-[11.5px]" : "py-1.5 pl-3 pr-7 text-[12.5px]"}`}
        style={{ background: `color-mix(in srgb, ${color} 14%, white)`, color: `color-mix(in srgb, ${color} 72%, black)`, fontSize: compact ? 11.5 : 12.5 }}
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

// WhatsApp + Call buttons. WhatsApp opens a chat with a polite first message already written.
export function ContactButtons({ lead, size = 34 }: { lead: LeadRow; size?: number }) {
  const org = useOrg();
  const digits = lead.phone?.replace(/[^\d]/g, "");
  if (!digits) return <span className="text-[12px] text-muted">No phone</span>;
  // Tapping WhatsApp or Call from a list is an outbound contact: it is logged on the lead (and takes it out of New).
  const logContact = (type: "WHATSAPP_LOGGED" | "CALL_LOGGED") => {
    void fetch(`/api/leads/${lead.id}/activities`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }), keepalive: true }).catch(() => {});
  };
  const wa = `https://wa.me/${digits}?text=${encodeURIComponent(buildWhatsAppLeadMessage(lead.name, org.name, lead.listing?.buildingName ?? null))}`;
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => logContact("WHATSAPP_LOGGED")} aria-label={`WhatsApp ${lead.name}`} title="WhatsApp" className="flex items-center justify-center rounded-full transition-opacity hover:opacity-80" style={{ background: "var(--success-soft)", color: "var(--success)", width: size, height: size }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21c5.46 0 9.9-4.44 9.9-9.9 0-2.64-1.03-5.13-2.9-7-1.87-1.87-4.36-2.9-7-2.92Zm4.52 11.91c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.13-.16.24-.64.81-.78.97-.14.17-.29.19-.53.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.23-1.46-1.37-1.7-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.36-.77-1.86-.2-.48-.41-.42-.56-.43h-.48c-.16 0-.43.06-.66.31-.22.24-.87.85-.87 2.08 0 1.22.89 2.4 1.02 2.57.12.16 1.75 2.68 4.25 3.75.59.26 1.05.41 1.41.53.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.16-.47-.28Z" />
        </svg>
      </a>
      <a href={`tel:${lead.phone}`} onClick={() => logContact("CALL_LOGGED")} aria-label={`Call ${lead.name}`} title="Call" className="flex items-center justify-center rounded-full bg-surface-muted text-foreground transition-colors hover:bg-border" style={{ width: size, height: size }}>
        <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
          <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
        </svg>
      </a>
    </div>
  );
}
