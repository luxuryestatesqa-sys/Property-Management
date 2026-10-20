"use client";

import { can } from "@/lib/permissions";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";
import { useConfirm } from "@/components/ConfirmDialog";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { useOrg } from "@/components/OrgProvider";
import { buildWhatsAppLeadMessage } from "@/lib/whatsapp";
import { timeAgo, fullDateTime } from "@/lib/timeAgo";
import { fromQatarInput, qatarDayDiff, qatarInputValue } from "@/lib/qatarTime";
import { formatQAR, formatSqm, listingCode } from "@/lib/format";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS } from "@/lib/propertyCategory";
import { CHANNEL_LABELS, LeadGroupDTO, LeadStageDTO, SOURCE_LABELS } from "@/components/leads/leadTypes";
import { IconChevronLeft, IconPin } from "@/components/desktop/icons";
import LeadProperty from "@/components/leads/LeadProperty";
import ViewingsCard from "@/components/ViewingsCard";

interface Activity {
  id: string;
  type: string;
  text: string | null;
  createdAt: string;
  data?: { name?: string; mime?: string; size?: number; from?: string; to?: string } | null;
  user: { id: string; name: string; avatarUrl: string | null } | null;
}

type ComposerTab = "note" | "followup" | "meeting" | "voice" | "document";
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_RECORD_SECONDS = 300;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function fileSize(bytes?: number): string {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface Detail {
  lead: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    whatsappUsername: string | null;
    source: keyof typeof SOURCE_LABELS;
    sourceLabel?: string | null;
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
    details: { label: string; value: string }[];
    activities: Activity[];
    tasks: { id: string; text: string; dueAt: string; doneAt: string | null }[];
    groups: LeadGroupDTO[];
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
      shareToken?: string | null;
      unitDetailsPrivate?: boolean;
      apartmentNumber?: string;
      floor?: string;
    } | null;
  };
  stages: LeadStageDTO[];
  agents: { id: string; name: string; avatarUrl: string | null }[];
  related: { id: string; name: string; receivedAt: string; listingReference: string | null; stage: { name: string; color: string | null } }[];
  groups: LeadGroupDTO[];
  canManage: boolean;
}

// A local "datetime-local" value for the given offset from now.
// A "datetime-local" value in Qatar time for the given offset from now (see lib/qatarTime.ts).
const dueInput = qatarInputValue;

const TIMELINE: Record<string, { label: string; color: string; icon: string }> = {
  RECEIVED: { label: "Lead received", color: "var(--text-muted)", icon: "M12 5v14M5 12l7 7 7-7" },
  ASSIGNED: { label: "Assigned", color: "var(--text-muted)", icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01M19 8v6M22 11h-6" },
  UNASSIGNED: { label: "Unassigned", color: "var(--text-muted)", icon: "M12 9v4M12 17h.01" },
  STAGE_CHANGED: { label: "Stage changed", color: "var(--primary)", icon: "M5 12h14M13 6l6 6-6 6" },
  PF_STATUS: { label: "Property Finder", color: "var(--text-muted)", icon: "M3 12h4l3 8 4-16 3 8h4" },
  NOTE: { label: "Note", color: "var(--warning)", icon: "M4 4h16v12H8l-4 4zM8 9h8M8 12.5h5" },
  CALL_LOGGED: { label: "Call", color: "var(--success)", icon: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" },
  WHATSAPP_LOGGED: { label: "WhatsApp", color: "var(--success)", icon: "M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
  VIEWING_BOOKED: { label: "Viewing", color: "var(--primary)", icon: "M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5" },
  TASK_CREATED: { label: "Follow-up set", color: "var(--text-muted)", icon: "M12 6v6l4 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" },
  TASK_DONE: { label: "Follow-up done", color: "var(--success)", icon: "M5 12.5l4.5 4.5L19 7.5" },
  GROUP_CHANGED: { label: "Groups", color: "var(--text-muted)", icon: "M4 6h16M4 12h16M4 18h10" },
  VOICE_NOTE: { label: "Voice note", color: "var(--text-muted)", icon: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM19 11a7 7 0 0 1-14 0M12 18v3" },
  VIEWING_DONE: { label: "Viewing done", color: "var(--success)", icon: "M5 12.5l4.5 4.5L19 7.5" },
  VIEWING_CANCELLED: { label: "Viewing cancelled", color: "var(--danger)", icon: "M6 6l12 12M18 6 6 18" },
  MERGED: { label: "Merged", color: "var(--text-muted)", icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
  PROPERTY_LINKED: { label: "Property linked", color: "var(--primary)", icon: "M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5" },
  DOCUMENT: { label: "Document", color: "var(--text-muted)", icon: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" },
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

// Some imports store the name twice ("Ali Khan Ali Khan"); show it once.
function displayName(name: string) {
  const words = name.trim().split(/\s+/);
  const half = words.length / 2;
  if (words.length >= 2 && Number.isInteger(half) && words.slice(0, half).join(" ").toLowerCase() === words.slice(half).join(" ").toLowerCase()) return words.slice(0, half).join(" ");
  return name;
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const org = useOrg();
  const isDesktop = useIsDesktop();
  const { data: session } = useSession();
  const confirm = useConfirm();
  const [mtab, setMtab] = useState<"overview" | "details" | "timeline">("overview");
  const [options, setOptions] = useState(false);
  const [addSheet, setAddSheet] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [data, setData] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Saves can take a couple of seconds: show that something is happening.
  const [saves, setSaves] = useState(0);
  const saving = saves > 0 || busy;
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  const [taskText, setTaskText] = useState("");
  const [taskDue, setTaskDue] = useState(() => dueInput(24, 10));
  const [newGroup, setNewGroup] = useState("");
  const [tab, setTab] = useState<ComposerTab>("note");
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [voice, setVoice] = useState<{ blob: Blob; url: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    []
  );

  // Only the newest load may update the page: a slow earlier response must not overwrite a change that was just saved.
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const res = await fetch(`/api/leads/${id}`, { cache: "no-store" });
    if (seq !== loadSeq.current) return;
    if (res.status === 404) return setMissing(true);
    if (res.ok) {
      const json = await res.json();
      if (seq === loadSeq.current) setData(json);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setError("");
    setSaves((n) => n + 1);
    try {
      const res = await fetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) setError((await res.json().catch(() => null))?.error ?? "Couldn't save that change");
      await load();
    } finally {
      setSaves((n) => n - 1);
    }
  }

  // A request that is already on its way is not sent again (double click, Enter held down).
  const inflight = useRef(new Set<string>());
  async function send(url: string, method: string, body?: unknown) {
    const key = `${method} ${url} ${JSON.stringify(body ?? null)}`;
    if (inflight.current.has(key)) return false;
    inflight.current.add(key);
    try {
      return await sendOnce(url, method, body);
    } finally {
      inflight.current.delete(key);
    }
  }
  async function sendOnce(url: string, method: string, body?: unknown) {
    setError("");
    setSaves((n) => n + 1);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (!res.ok) setError((await res.json().catch(() => null))?.error ?? "Couldn't save");
      await load();
      return res.ok;
    } finally {
      setSaves((n) => n - 1);
    }
  }

  // Fold a duplicate lead into this one: its timeline, follow-ups and groups move here.
  async function mergeDuplicate(fromId: string) {
    if (!window.confirm("Merge that duplicate into this lead? Its timeline and follow-ups will be added here and the duplicate removed.")) return;
    await send(`/api/leads/${id}/merge`, "POST", { fromId });
  }

  async function addTask() {
    if (!taskText.trim()) return;
    const text = tab === "meeting" ? `Meeting: ${taskText.trim()}` : taskText;
    if (await send(`/api/leads/${id}/tasks`, "POST", { text, dueAt: fromQatarInput(taskDue).toISOString() })) {
      setTaskText("");
      setTaskDue(dueInput(24, 10));
      setAdding(false);
    }
  }

  function openAdd(t: ComposerTab) {
    setTab(t);
    setMenu(false);
    setAdding(true);
  }

  function closeAdd() {
    if (recording) stopRecording();
    setVoice(null);
    setFile(null);
    setCaption("");
    setAdding(false);
  }

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        setVoice({ blob, url: URL.createObjectURL(blob) });
      };
      recorder.current = rec;
      rec.start();
      setVoice(null);
      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_RECORD_SECONDS) stopRecording();
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("Couldn't use the microphone. Allow microphone access in your browser and try again.");
    }
  }

  function stopRecording() {
    if (timer.current) clearInterval(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    setRecording(false);
  }

  async function saveAttachment(kind: "VOICE_NOTE" | "DOCUMENT") {
    const blob = kind === "VOICE_NOTE" ? voice?.blob : file;
    if (!blob) return;
    if (blob.size > MAX_FILE_BYTES) return setError("That file is too large. The limit is 3 MB.");
    setBusy(true);
    try {
      const ok = await send(`/api/leads/${id}/attachments`, "POST", {
        kind,
        name: kind === "VOICE_NOTE" ? "Voice note" : (file as File).name,
        text: caption,
        dataUrl: await readAsDataUrl(blob),
      });
      if (ok) {
        setCaption("");
        setVoice(null);
        setFile(null);
        setAdding(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function createGroup() {
    const name = newGroup.trim();
    if (!name || !data) return;
    const res = await fetch("/api/leads/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const json = await res.json().catch(() => null);
    if (!res.ok) return setError(json?.error ?? "Couldn't create the group");
    setNewGroup("");
    await send(`/api/leads/${id}/groups`, "PUT", { groupIds: [...data.lead.groups.map((g) => g.id), json.group.id] });
  }

  async function log(type: string, text?: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/leads/${id}/activities`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, text }) });
      if (!res.ok) setError((await res.json().catch(() => null))?.error ?? "Couldn't save");
      else {
        if (type === "NOTE") {
          setNote("");
          setAdding(false);
        }
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
        <Link href="/leads" className="font-medium" style={{ color: "var(--primary)" }}>
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

  const { lead, stages, agents, related, canManage, groups } = data;
  const inGroup = new Set(lead.groups.map((g) => g.id));
  const toggleGroup = (gid: string) => send(`/api/leads/${id}/groups`, "PUT", { groupIds: inGroup.has(gid) ? [...inGroup].filter((x) => x !== gid) : [...inGroup, gid] });
  const digits = lead.phone?.replace(/[^\d]/g, "");
  const wa = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(buildWhatsAppLeadMessage(lead.name, org.name, lead.listing?.buildingName ?? null))}` : null;
  const responseMs = lead.firstContactedAt ? new Date(lead.firstContactedAt).getTime() - new Date(lead.receivedAt).getTime() : null;
  const listing = lead.listing;

  const addOptions: [ComposerTab, string, string, string][] = [
    ["note", "Note", "Write down what was discussed", "M4 4h16v12H8l-4 4zM8 9h8M8 12.5h5"],
    ["followup", "Follow-up", "Remind yourself to get back", "M12 6v6l4 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z"],
    ["meeting", "Meeting", "Schedule a viewing or meeting", "M3 10h18M7 3v4M17 3v4M5 6h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"],
    ["voice", "Voice note", "Record a quick audio note", "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM19 11a7 7 0 0 1-14 0M12 18v3"],
    ["document", "File", "Upload a PDF, image or document", "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5"],
  ];
  const addTitle: Record<ComposerTab, string> = { note: "Add a note", followup: "Add a follow-up", meeting: "Schedule a meeting", voice: "Record a voice note", document: "Upload a file" };
  const input = "rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:border-primary";
  const primaryBtn = "rounded-xl px-5 py-2.5 text-[13.5px] font-medium text-white disabled:opacity-50";
  const stageColor = lead.stage.color ?? "var(--primary)";
  const openTasks = lead.tasks.filter((t) => !t.doneAt);
  const overdueTasks = openTasks.filter((t) => new Date(t.dueAt).getTime() < now).length;
  // One colour per stage, the same ones the dashboard and the Leads page use.
  const flowColors = (() => {
    const palette = ["#2b4fc0", "#06b6d4", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6"];
    let n = -1;
    return new Map(stages.map((st) => [st.id, st.kind === "WON" ? "#16a34a" : st.kind === "LOST" ? "#f43f5e" : palette[++n % palette.length]]));
  })();
  const currentIdx = stages.findIndex((st) => st.id === lead.stageId);
  // Machine-written events stay as quiet one-liners; things people added get a card.
  const QUIET = new Set(["RECEIVED", "ASSIGNED", "UNASSIGNED", "STAGE_CHANGED", "PF_STATUS", "GROUP_CHANGED", "TASK_CREATED", "TASK_DONE", "MERGED", "PROPERTY_LINKED", "VIEWING_BOOKED", "VIEWING_DONE", "VIEWING_CANCELLED"]);
  const LIMIT = 8;
  const shown = showAll ? lead.activities : lead.activities.slice(0, LIMIT);

  const detailsColumn = (
    <div className="flex flex-col gap-5">
      <div className={card}>
        <h2 className="mb-3.5 text-[15px] font-medium">Lead info</h2>
        <dl className="flex flex-col gap-3.5 text-[14px]">
          <div>
            <dt className={label}>Phone</dt>
            <dd className="mt-0.5">{lead.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className={label}>Email</dt>
            <dd className="mt-0.5 break-all">{lead.email ?? "—"}</dd>
          </div>
          {lead.region && (
            <div>
              <dt className={label}>Area</dt>
              <dd className="mt-0.5 flex items-center gap-1.5">
                <IconPin size={14} className="text-muted" />
                {lead.region}
              </dd>
            </div>
          )}
          <div>
            <dt className={label}>Handled by</dt>
            <dd className="mt-1">
              {canManage ? (
                <select value={lead.assignedTo?.id ?? ""} onChange={(e) => patch({ assignedToId: e.target.value || null })} className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[14px] outline-none">
                  <option value="">Unassigned</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              ) : lead.assignedTo ? (
                <div className="flex items-center gap-2.5">
                  <Avatar name={lead.assignedTo.name} avatarUrl={lead.assignedTo.avatarUrl} size={28} />
                  <span>{lead.assignedTo.name}</span>
                </div>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className={card}>
        <h2 className="mb-3 text-[15px] font-medium">Groups</h2>
        <div className="flex flex-wrap gap-1.5">
          {groups.map((g) => {
            const on = inGroup.has(g.id);
            return (
              <button key={g.id} type="button" onClick={() => toggleGroup(g.id)} className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${on ? "text-white" : "bg-surface-muted text-slate-600 hover:bg-border"}`} style={on ? { background: g.color ?? "var(--primary)" } : undefined}>
                {g.name}
              </button>
            );
          })}
          {groups.length === 0 && !canManage && <span className="text-[13px] text-muted">No groups yet.</span>}
        </div>
        {canManage && (
          <div className="mt-3 flex gap-2">
            <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createGroup()} placeholder="New group, e.g. Investors" maxLength={40} className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-[13.5px] outline-none" />
            <button type="button" disabled={!newGroup.trim()} onClick={createGroup} className="rounded-xl bg-surface-muted px-3.5 py-2 text-[13px] font-medium text-slate-700 transition-colors hover:bg-border disabled:opacity-50">
              Create
            </button>
          </div>
        )}
      </div>

      {listing && (
        <Link href={`/property/${listing.id}`} className="group block overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-md">
          {listing.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.cover} alt="" className="aspect-[16/9] w-full object-cover" />
          )}
          <div className="p-5">
            <div className="text-[12px] font-medium text-muted">Enquired about</div>
            <div className="mt-0.5 text-[16px] font-medium group-hover:text-primary">{listing.buildingName}</div>
            <div className="mt-0.5 text-[13px] text-muted">
              {listing.area} → {listing.community} · {listingCode(listing.id)}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-foreground/80">
              <span className="tnum font-medium">
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

      <LeadProperty leadId={lead.id} leadName={lead.name} phone={lead.phone} listing={listing} onChange={load} />

      <ViewingsCard leadId={lead.id} defaultListing={listing ? { id: listing.id, label: `${listingCode(listing.id)} ${listing.buildingName}` } : null} agents={canManage ? agents : undefined} onBooked={load} />

      {lead.channel === "CALL" && (lead.callTalkTime !== null || lead.callRecordUrl) && (
        <div className={card}>
          <h2 className="mb-3.5 text-[15px] font-medium">Call details</h2>
          <div className="grid grid-cols-2 gap-3 text-[14px]">
            <div>
              <div className={label}>Talk time</div>
              <div className="mt-0.5">{lead.callTalkTime !== null ? `${Math.floor(lead.callTalkTime / 60)}m ${lead.callTalkTime % 60}s` : "—"}</div>
            </div>
            <div>
              <div className={label}>Waited</div>
              <div className="mt-0.5">{lead.callWaitTime !== null ? `${lead.callWaitTime}s` : "—"}</div>
            </div>
          </div>
          {lead.callRecordUrl && <audio controls preload="none" src={lead.callRecordUrl} className="mt-4 w-full" />}
        </div>
      )}

      {(lead.details.length > 0 || lead.tags.length > 0) && (
        <div className={card}>
          <h2 className="mb-3.5 text-[15px] font-medium">Enquiry details</h2>
          {lead.details.length > 0 && (
            <dl className="flex flex-col gap-3 text-[14px]">
              {lead.details.map((d, i) => (
                <div key={`${d.label}-${i}`}>
                  <dt className={label}>{d.label}</dt>
                  <dd className="mt-0.5 whitespace-pre-line break-words">{d.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {lead.tags.length > 0 && (
            <div className={`flex flex-wrap gap-1.5 ${lead.details.length ? "mt-4" : ""}`}>
              {lead.tags.map((t) => (
                <span key={t} className="rounded-full bg-surface-muted px-2.5 py-1 text-[12px] font-medium text-slate-600">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <details className="group rounded-2xl border border-border bg-surface shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-[14px] font-medium [&::-webkit-details-marker]:hidden">
          More info
          <svg className="transition-transform group-open:rotate-180" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="flex flex-col gap-4 border-t border-border px-5 py-4">
      {related.length > 0 && (
        <div>
          <h3 className="mb-2 text-[13px] font-medium">Possible duplicates (same phone number)</h3>
          <ul className="flex flex-col gap-2.5">
            {related.map((r) => (
              <li key={r.id}>
                <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-slate-50">
                  <Link href={`/leads/${r.id}`} className="min-w-0 truncate">
                    <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[10.5px] font-bold text-warning">Duplicate</span> <span className="font-medium">{r.listingReference ?? r.name}</span> <span className="text-muted">· {timeAgo(r.receivedAt)}</span>
                  </Link>
                  <button type="button" onClick={() => mergeDuplicate(r.id)} className="shrink-0 rounded-lg bg-surface-muted px-2.5 py-1 text-[12px] font-semibold hover:bg-border">
                    Merge into this lead
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-1 text-[12px] text-muted">
        {/* Property Finder's delivery status only exists for Property Finder enquiries; other sources just say where they came from. */}
        {lead.source === "PROPERTY_FINDER" ? (
          <>Property Finder status: <span className="font-medium">{lead.pfStatus ?? "—"}</span></>
        ) : (
          <>Source: <span className="font-medium">{lead.sourceLabel ?? SOURCE_LABELS[lead.source]}</span></>
        )}{" "}
        · Received {fullDateTime(lead.receivedAt)}
      </div>
        </div>
      </details>
    </div>
  );

  const taskRow = (t: Detail["lead"]["tasks"][number]) => {
    const overdue = new Date(t.dueAt).getTime() < now;
    const meeting = t.text.startsWith("Meeting:");
    return (
      <li key={t.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
        <button type="button" aria-label="Mark done" onClick={() => send(`/api/leads/tasks/${t.id}`, "PATCH", { done: true })} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-colors hover:border-emerald-500" />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
          {meeting && <span className="mr-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-violet-700">Meeting</span>}
          {meeting ? t.text.replace(/^Meeting:\s*/, "") : t.text}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${overdue ? "bg-rose-50 text-rose-600" : "text-muted"}`} title={fullDateTime(t.dueAt)}>
          {overdue ? "Overdue · " : ""}
          {new Date(t.dueAt).toLocaleString("en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}
        </span>
        <button type="button" aria-label="Delete" onClick={() => send(`/api/leads/tasks/${t.id}`, "DELETE")} className="shrink-0 text-slate-300 transition-colors hover:text-rose-500 lg:opacity-0 lg:group-hover:opacity-100">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </li>
    );
  };

  const activityColumn = (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Coming up: only when there is something to do */}
      {openTasks.length > 0 && (
        <div className={card}>
          <h2 className="text-[15px] font-medium">Coming up</h2>
          <ul className="mt-2 flex flex-col gap-1">{openTasks.map(taskRow)}</ul>
        </div>
      )}

      {/* Timeline */}
      <div>
        <h2 className="mb-3 text-[20px] font-medium tracking-[-0.01em]">Timeline</h2>
        <div className={card}>
          <ol>
            <li className="relative flex gap-4 pb-7">
              <span className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-slate-200" />
              <button type="button" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label="Add activity" className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 bg-surface transition-colors hover:bg-accent-light" style={{ borderColor: "var(--primary)", color: "var(--primary)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <div className="relative flex min-h-10 items-center">
                <button type="button" onClick={() => setMenu((m) => !m)} className="text-[15px] font-medium" style={{ color: "var(--primary)" }}>
                  Add Activity
                </button>
                {menu && (
                  <>
                    <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setMenu(false)} />
                    <div role="menu" className="absolute left-0 top-12 z-40 w-72 overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-xl">
                      {addOptions.map(([v, l, hint, icon]) => (
                        <button key={v} type="button" role="menuitem" onClick={() => openAdd(v)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-muted">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-light text-primary">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d={icon} />
                            </svg>
                          </span>
                          <span>
                            <span className="block text-[14px] font-medium">{l}</span>
                            <span className="block text-[12px] text-muted">{hint}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </li>

            {shown.map((a, i) => {
              const t = TIMELINE[a.type] ?? { label: a.type, color: "var(--text-muted)", icon: "M12 5v14" };
              const last = i === shown.length - 1;
              const when = new Date(a.createdAt);
              const fromStage = a.type === "STAGE_CHANGED" ? stages.find((x) => x.id === a.data?.from) : undefined;
              const toStage = a.type === "STAGE_CHANGED" ? stages.find((x) => x.id === a.data?.to) : undefined;
              const c = toStage?.color ?? t.color;
              const title = QUIET.has(a.type) ? (a.text ?? t.label) : t.label;
              const chip = (st: LeadStageDTO) => (
                <span key={st.id} className="rounded-full px-3 py-1 text-[13px] font-medium" style={{ background: `color-mix(in srgb, ${st.color ?? "var(--primary)"} 16%, white)`, color: `color-mix(in srgb, ${st.color ?? "var(--primary)"} 70%, black)` }}>
                  {st.name}
                </span>
              );
              return (
                <li key={a.id} className={`relative flex gap-4 ${last ? "" : "pb-7"}`}>
                  {!last && <span className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-slate-200" />}
                  <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--surface-elevated)", color: c, border: "1px solid var(--border)", boxShadow: "0 4px 14px rgba(13,31,92,0.08)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={t.icon} />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="tnum text-[13px] font-medium tracking-wide text-slate-700" title={fullDateTime(a.createdAt)}>
                      {when.toLocaleDateString("en-US", { timeZone: "Asia/Qatar", month: "short", day: "numeric", year: "numeric" })} <span className="ml-1 font-medium text-slate-500">{when.toLocaleTimeString("en-US", { timeZone: "Asia/Qatar", hour: "numeric", minute: "2-digit" })}</span>
                    </div>
                    {fromStage && toStage ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {chip(fromStage)}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-subtle)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                        {chip(toStage)}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-[15px] font-medium leading-snug text-foreground">{title}</div>
                    )}
                    {!QUIET.has(a.type) && a.text && <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-foreground/80">{a.text}</p>}
                    {a.type === "VOICE_NOTE" && <audio controls preload="none" src={`/api/leads/${id}/attachments/${a.id}`} className="mt-2.5 h-10 w-full max-w-md" />}
                    {a.type === "DOCUMENT" && (
                      <a href={`/api/leads/${id}/attachments/${a.id}?download=1`} className="mt-2.5 inline-flex max-w-full items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[13.5px] transition-colors hover:bg-surface-muted">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-teal-600">
                          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" />
                        </svg>
                        <span className="min-w-0 truncate font-medium">{a.data?.name ?? "File"}</span>
                        <span className="shrink-0 text-[12px] text-muted">{fileSize(a.data?.size)}</span>
                      </a>
                    )}
                    {a.user && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-slate-500">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="9" />
                          <circle cx="12" cy="10" r="3" />
                          <path d="M6.2 18.5c1.2-2.2 3.3-3.3 5.8-3.3s4.6 1.1 5.8 3.3" />
                        </svg>
                        by {a.user.name}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {lead.activities.length > LIMIT && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-5 text-[13px] font-medium" style={{ color: "var(--primary)" }}>
              {showAll ? "Show less" : `Show ${lead.activities.length - LIMIT} earlier`}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // The form for whatever was picked from the Add menu.
  const addModal = adding && (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 lg:items-center lg:p-6" onMouseDown={(e) => e.target === e.currentTarget && closeAdd()}>
      <div role="dialog" aria-label={addTitle[tab]} className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-2xl lg:max-w-lg lg:rounded-3xl lg:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-medium">{addTitle[tab]}</h2>
          <button type="button" onClick={closeAdd} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {tab === "note" && (
          <div className="flex flex-col gap-3">
            <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was discussed, budget, next step…" rows={5} maxLength={2000} className={`${input} w-full resize-none`} />
            <div className="flex justify-end">
              <button type="button" disabled={busy || !note.trim()} onClick={() => log("NOTE", note)} className={primaryBtn} style={{ background: "var(--primary)" }}>
                {busy ? "Saving…" : "Save note"}
              </button>
            </div>
          </div>
        )}

        {(tab === "followup" || tab === "meeting") && (
          <div className="flex flex-col gap-3">
            <input autoFocus value={taskText} onChange={(e) => setTaskText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} placeholder={tab === "meeting" ? "e.g. Viewing at the property, meet at reception" : "e.g. Call back about the viewing"} maxLength={290} className={input} />
            <div>
              <label className="mb-1 block text-[12px] font-medium text-muted">When</label>
              <input type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className={`${input} w-full`} />
              <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
                {[["In 1 hour", () => dueInput(1)], ["Tomorrow 10 am", () => dueInput(24, 10)], ["In 3 days", () => dueInput(72, 10)]].map(([l, fn]) => (
                  <button key={l as string} type="button" onClick={() => setTaskDue((fn as () => string)())} className="rounded-full bg-surface-muted px-2.5 py-1 font-medium text-slate-600 transition-colors hover:bg-border">
                    {l as string}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <button type="button" disabled={!taskText.trim() || !taskDue} onClick={addTask} className={primaryBtn} style={{ background: "var(--primary)" }}>
                {tab === "meeting" ? "Schedule" : "Add follow-up"}
              </button>
            </div>
          </div>
        )}

        {tab === "voice" && (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            {!voice && !recording && (
              <>
                <button type="button" onClick={startRecording} className="flex h-16 w-16 items-center justify-center rounded-full text-white shadow-md transition-transform hover:scale-105" style={{ background: "#ec4899" }} aria-label="Start recording">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM19 11a7 7 0 0 1-14 0M12 18v3" />
                  </svg>
                </button>
                <p className="text-[13.5px] text-muted">Tap to start recording. Up to 5 minutes.</p>
              </>
            )}
            {recording && (
              <>
                <button type="button" onClick={stopRecording} className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 text-white shadow-md" aria-label="Stop recording">
                  <span className="h-5 w-5 rounded-sm bg-white" />
                </button>
                <div className="flex items-center gap-2 text-[15px] font-medium">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600" />
                  <span className="tnum">
                    {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
                  </span>
                </div>
                <p className="text-[13px] text-muted">Tap the square to stop.</p>
              </>
            )}
            {voice && !recording && (
              <div className="flex w-full flex-col gap-3 text-left">
                <audio controls src={voice.url} className="w-full" />
                <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a short caption (optional)" maxLength={500} className={input} />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setVoice(null)} className="rounded-xl px-4 py-2.5 text-[13.5px] font-medium text-slate-600 hover:bg-surface-muted">
                    Record again
                  </button>
                  <button type="button" disabled={busy} onClick={() => saveAttachment("VOICE_NOTE")} className={primaryBtn} style={{ background: "var(--primary)" }}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "document" && (
          <div className="flex flex-col gap-3">
            <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border bg-surface-muted/40 px-4 py-8 text-center text-[13.5px] text-muted transition-colors hover:border-primary hover:text-foreground">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
              </svg>
              <span className="font-medium text-foreground">{file ? file.name : "Choose a file"}</span>
              <span className="text-[12px]">{file ? fileSize(file.size) : "PDF, Word, Excel, image or text. Up to 3 MB."}</span>
              <input type="file" className="hidden" accept="application/pdf,image/png,image/jpeg,image/webp,image/gif,text/plain,text/csv,.doc,.docx,.xls,.xlsx,.zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {file && <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a short description (optional)" maxLength={500} className={input} />}
            <div className="flex justify-end">
              <button type="button" disabled={busy || !file} onClick={() => saveAttachment("DOCUMENT")} className={primaryBtn} style={{ background: "var(--primary)" }}>
                {busy ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ------------------------------------------------------------------------------------------
  // Phone layout: a title block, quick actions, then three tabs (Overview, Details, Timeline).
  if (!isDesktop) {
    const isAdmin = can(session?.user, "leads.delete");
    const next = openTasks[0];
    const dayDiff = (iso: string) => qatarDayDiff(iso, now);
    const followLabel = (iso: string) => {
      if (new Date(iso).getTime() < now) return "Follow-up overdue";
      const d = dayDiff(iso);
      return d === 0 ? "Follow-up today" : d === 1 ? "Follow-up tomorrow" : `Follow-up in ${d} days`;
    };
    const last = lead.activities[0];
    const lastLabel = last ? (TIMELINE[last.type]?.label ?? last.type) : null;
    const ic = (d: string, size = 20) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    );
    const deleteLead = async () => {
      setOptions(false);
      const ok = await confirm({ title: "Delete this lead?", message: "Its notes, voice notes, files and follow-ups are deleted too. This can't be undone.", confirmLabel: "Delete", danger: true });
      if (!ok) return;
      const res = await fetch("/api/leads/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", leadIds: [id] }) });
      if (res.ok) router.replace("/leads");
      else setError((await res.json().catch(() => null))?.error ?? "Couldn't delete the lead");
    };
    const tabs: [typeof mtab, string][] = [["overview", "Overview"], ["details", "Details"], ["timeline", "Timeline"]];
    const rowCard = "flex w-full items-center gap-3.5 rounded-2xl bg-surface p-4 text-left shadow-sm active:opacity-80";
    const sheetBtn = "flex w-full items-center gap-3.5 rounded-xl px-1 py-3 text-left active:bg-surface-muted";

    return (
      <div className="pb-28 page-in">
        {/* top bar */}
        <div className="sticky top-0 z-30 flex items-center justify-between bg-background px-3 py-2.5">
          <button type="button" onClick={() => router.back()} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full active:bg-surface-muted">
            {ic("M19 12H5M12 19l-7-7 7-7", 22)}
          </button>
          <button type="button" onClick={() => setOptions(true)} className="rounded-full px-3 py-2 text-[15px] font-medium active:bg-surface-muted">
            Options
          </button>
        </div>

        <div className="px-4 pt-1">
          {error && <div className="mb-3 rounded-xl bg-danger-bg px-4 py-3 text-[13.5px] text-danger">{error}</div>}
          <h1 className="break-words text-[26px] font-semibold leading-tight tracking-[-0.02em]">{displayName(lead.name)}</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            {SOURCE_LABELS[lead.source]} · {CHANNEL_LABELS[lead.channel]} · received {timeAgo(lead.receivedAt)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {lead.assignedTo ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[12.5px] text-slate-600 ring-1 ring-border">
                {ic("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 .01", 13)}
                {lead.assignedTo.name}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-[12.5px] font-medium text-amber-900">Unassigned</span>
            )}
            {responseMs !== null ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-success-bg px-3 py-1 text-[12.5px]" style={{ color: "var(--success)" }}>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Replied in {duration(responseMs)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-[12.5px] text-amber-900">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                Waiting {duration(now - new Date(lead.receivedAt).getTime())}
              </span>
            )}
          </div>

          {/* quick actions */}
          <div className="mt-4 flex gap-2.5">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => log("WHATSAPP_LOGGED")} className="flex h-[68px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[12.5px] font-medium active:opacity-80" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
                {ic("M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", 21)}
                WhatsApp
              </a>
            )}
            {lead.phone && (
              <a href={`tel:${lead.phone}`} onClick={() => log("CALL_LOGGED")} className="flex h-[68px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[12.5px] font-medium active:opacity-80 text-white" style={{ background: "var(--primary)" }}>
                {ic("M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z", 21)}
                Call
              </a>
            )}
            <button type="button" onClick={() => openAdd("followup")} className="flex h-[68px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[12.5px] font-medium active:opacity-80 bg-surface text-slate-700 shadow-sm ring-1 ring-border">
              {ic("M12 6v6l4 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", 21)}
              Follow-up
            </button>
            <button type="button" onClick={() => setAddSheet(true)} className="flex h-[68px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[12.5px] font-medium active:opacity-80 bg-surface text-slate-700 shadow-sm ring-1 ring-border">
              {ic("M12 5v14M5 12h14", 21)}
              Add
            </button>
          </div>
        </div>

        {/* tabs */}
        <div className="sticky top-[58px] z-20 mt-4 flex border-b border-border bg-background px-2">
          {tabs.map(([v, l]) => (
            <button key={v} type="button" onClick={() => setMtab(v)} aria-current={mtab === v} className={`-mb-px flex-1 border-b-2 px-2 pb-3 pt-2 text-[15px] transition-colors ${mtab === v ? "border-primary font-medium text-primary" : "border-transparent text-slate-500"}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="px-4 pt-4">
          {mtab === "overview" && (
            <div className="flex flex-col gap-3">
              {/* next follow-up */}
              <div className="overflow-hidden rounded-2xl bg-surface shadow-sm">
                <button type="button" onClick={() => (next ? setFollowOpen((o) => !o) : openAdd("followup"))} className="flex w-full items-center gap-3.5 p-4 text-left active:opacity-80">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${next && new Date(next.dueAt).getTime() < now ? "bg-rose-50 text-rose-600" : "bg-accent-light text-primary"}`}>{ic("M3 10h18M7 3v4M17 3v4M5 6h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium uppercase tracking-wide text-slate-500">{next ? followLabel(next.dueAt) : "No follow-up planned"}</span>
                    <span className="mt-0.5 block truncate text-[15px]">{next ? new Date(next.dueAt).toLocaleString("en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : "Tap to add one"}</span>
                  </span>
                  <span className={`text-muted transition-transform ${followOpen ? "rotate-180" : ""}`}>{ic(next ? "m6 9 6 6 6-6" : "M12 5v14M5 12h14", 18)}</span>
                </button>
                {followOpen && openTasks.length > 0 && <ul className="border-t border-border px-2 py-1.5">{openTasks.map(taskRow)}</ul>}
              </div>

              {/* last activity */}
              <button type="button" onClick={() => setMtab("timeline")} className={rowCard}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">{ic("M12 6v6l4 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium uppercase tracking-wide text-slate-500">{last ? `Last activity ${timeAgo(last.createdAt)}` : "No activity yet"}</span>
                  <span className="mt-0.5 block truncate text-[15px]">{lastLabel ?? "Add a note or follow-up"}</span>
                </span>
                <span className="text-muted">{ic("m9 6 6 6-6 6", 18)}</span>
              </button>

              {/* stage and owner */}
              <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-sm">
                <div>
                  <div className="mb-2 text-[12.5px] font-medium uppercase tracking-wide text-slate-500">Lead stage</div>
                  <span className="relative block">
                    <select value={lead.stageId} onChange={(e) => e.target.value !== lead.stageId && patch({ stageId: e.target.value })} aria-label="Lead stage" className="h-12 w-full appearance-none rounded-xl pl-4 pr-10 text-[15.5px] font-medium outline-none" style={{ background: `color-mix(in srgb, ${stageColor} 14%, white)`, color: `color-mix(in srgb, ${stageColor} 72%, black)` }}>
                      {stages.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name}
                        </option>
                      ))}
                    </select>
                    <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stageColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </div>
                {canManage && (
                  <div>
                    <div className="mb-2 text-[12.5px] font-medium uppercase tracking-wide text-slate-500">Handled by</div>
                    <span className="relative block">
                      <select value={lead.assignedTo?.id ?? ""} onChange={(e) => patch({ assignedToId: e.target.value || null })} className="h-12 w-full appearance-none rounded-xl border border-border bg-surface pl-4 pr-10 text-[15.5px] outline-none">
                        <option value="">Unassigned</option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      <svg className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                  </div>
                )}
              </div>

              {/* groups */}
              <div className="rounded-2xl bg-surface p-4 shadow-sm">
                <div className="mb-2.5 text-[12.5px] font-medium uppercase tracking-wide text-slate-500">Groups</div>
                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => {
                    const on = inGroup.has(g.id);
                    return (
                      <button key={g.id} type="button" onClick={() => toggleGroup(g.id)} className={`rounded-full px-3.5 py-2 text-[13.5px] font-medium ${on ? "text-white" : "bg-surface-muted text-slate-600"}`} style={on ? { background: g.color ?? "var(--primary)" } : undefined}>
                        {g.name}
                      </button>
                    );
                  })}
                  {groups.length === 0 && !canManage && <span className="text-[14px] text-muted">No groups yet.</span>}
                </div>
                {canManage && (
                  <div className="mt-3 flex gap-2">
                    <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createGroup()} placeholder="New group, e.g. Investors" maxLength={40} className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 text-[15px] outline-none focus:border-primary" />
                    <button type="button" disabled={!newGroup.trim()} onClick={createGroup} className="rounded-xl bg-surface-muted px-4 text-[14px] font-medium disabled:opacity-50">
                      Create
                    </button>
                  </div>
                )}
              </div>

              {/* contact */}
              <div className="divide-y divide-border rounded-2xl bg-surface px-4 shadow-sm">
                {[
                  ["Phone", lead.phone, lead.phone ? `tel:${lead.phone}` : null],
                  ["Email", lead.email, lead.email ? `mailto:${lead.email}` : null],
                  ["Area", lead.region, null],
                ].map(([k, v, href]) =>
                  v ? (
                    <div key={k as string} className="flex items-center justify-between gap-4 py-3.5">
                      <span className="text-[13.5px] text-muted">{k}</span>
                      {href ? (
                        <a href={href as string} className="min-w-0 truncate text-[15px] font-medium" style={{ color: "var(--primary)" }}>
                          {v}
                        </a>
                      ) : (
                        <span className="min-w-0 truncate text-[15px]">{v}</span>
                      )}
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}

          {mtab === "details" && detailsColumn}
          {mtab === "timeline" && activityColumn}
        </div>

        {(addSheet || options) && (
          <div className="fixed inset-0 z-50 flex items-end bg-[rgba(13,31,92,0.4)] backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && (setAddSheet(false), setOptions(false))}>
            <div role="dialog" className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-surface px-5 pb-8 pt-3 shadow-2xl">
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
              {addSheet ? (
                <>
                  <h2 className="mb-1 text-[19px] font-medium">Add activity</h2>
                  <ul>
                    {addOptions.map(([v, l, hint, icon]) => (
                      <li key={v}>
                        <button type="button" onClick={() => { setAddSheet(false); openAdd(v); }} className={sheetBtn}>
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-light text-primary">{ic(icon, 20)}</span>
                          <span>
                            <span className="block text-[15.5px] font-medium">{l}</span>
                            <span className="block text-[12.5px] text-muted">{hint}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <h2 className="mb-1 text-[19px] font-medium">Options</h2>
                  <ul>
                    {listing && (
                      <li>
                        <Link href={`/property/${listing.id}`} className={sheetBtn}>
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">{ic("M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5", 20)}</span>
                          <span className="text-[15.5px] font-medium">Open the property</span>
                        </Link>
                      </li>
                    )}
                    <li>
                      <button type="button" onClick={() => { setOptions(false); setMtab("timeline"); }} className={sheetBtn}>
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">{ic("M12 6v6l4 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", 20)}</span>
                        <span className="text-[15.5px] font-medium">Full timeline</span>
                      </button>
                    </li>
                    {isAdmin && (
                      <li>
                        <button type="button" onClick={deleteLead} className={sheetBtn}>
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">{ic("M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3", 20)}</span>
                          <span className="text-[15.5px] font-medium text-rose-600">Delete lead</span>
                        </button>
                      </li>
                    )}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
        {addModal}
      </div>
    );
  }

  return (
    <div className="px-4 pb-24 lg:px-0 lg:pb-12 page-in">
      {saving && (
        <div role="status" className="fixed bottom-20 right-4 z-50 rounded-full bg-slate-900/90 px-4 py-2 text-[13px] font-medium text-white shadow-lg lg:bottom-6">
          Saving…
        </div>
      )}
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

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[22px] font-semibold text-white shadow-md" style={{ background: `linear-gradient(135deg, ${flowColors.get(lead.stageId) ?? "#2b4fc0"}, ${flowColors.get(lead.stageId) ?? "#2b4fc0"}bb)` }}>{lead.name.trim().charAt(0).toUpperCase()}</span>
            <div className="min-w-0">
              <h1 className="truncate text-[24px] font-semibold leading-tight tracking-[-0.02em] lg:text-[28px]">{lead.name}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[13.5px] text-muted">
                <span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ background: "#dbeafe", color: "#1d4ed8" }}>{SOURCE_LABELS[lead.source]}</span>
                <span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ background: "#cffafe", color: "#0e7490" }}>{CHANNEL_LABELS[lead.channel]}</span>
                received {timeAgo(lead.receivedAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => log("WHATSAPP_LOGGED")} className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[14px] font-medium" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
                WhatsApp
              </a>
            )}
            {lead.phone && (
              <a href={`tel:${lead.phone}`} onClick={() => log("CALL_LOGGED")} className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[14px] font-medium text-white" style={{ background: "var(--primary)" }}>
                Call
              </a>
            )}
          </div>
        </div>
      </div>

      {/* The two things that matter most: where this lead is, and whether anyone has replied */}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm lg:px-5">
        <label className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-muted">Stage</span>
          <span className="relative">
            <select
              value={lead.stageId}
              onChange={(e) => e.target.value !== lead.stageId && patch({ stageId: e.target.value })}
              aria-label="Lead stage"
              className="cursor-pointer appearance-none rounded-xl py-2.5 pl-4 pr-10 text-[14px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary"
              style={{ background: `color-mix(in srgb, ${stageColor} 14%, white)`, color: `color-mix(in srgb, ${stageColor} 72%, black)` }}
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={stageColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </label>
        <span className="hidden h-6 w-px bg-border sm:block" />
        {responseMs !== null ? (
          <span className="inline-flex items-center gap-2 text-[13.5px] text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Replied in <span className="font-medium">{duration(responseMs)}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-[13.5px] text-amber-800">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            Not contacted yet · waiting <span className="font-medium">{duration(now - new Date(lead.receivedAt).getTime())}</span>
          </span>
        )}
      </div>

      {/* Pipeline: every stage in order, the lead's stage lit, one tap to move it */}
      <div className="mt-4 rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm lg:px-5">
        <ol className="flex flex-wrap items-center gap-2" aria-label="Lead pipeline">
          {stages.map((st, i) => {
            const c = flowColors.get(st.id) ?? "#2b4fc0";
            const here = st.id === lead.stageId;
            const passed = i < currentIdx && st.kind === "OPEN";
            return (
              <li key={st.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => !here && patch({ stageId: st.id })}
                  aria-current={here ? "step" : undefined}
                  title={here ? "Current stage" : `Move to ${st.name}`}
                  className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-all hover:opacity-90"
                  style={here ? { background: c, color: "#fff", boxShadow: `0 4px 12px ${c}55` } : passed ? { background: `${c}22`, color: c } : { background: "var(--primary-soft)", color: "var(--text-muted)" }}
                >
                  {passed && <span className="mr-1">✓</span>}
                  {st.name}
                </button>
                {i < stages.length - 1 && <span className="text-slate-300" aria-hidden="true">›</span>}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[
          { label: "Received", value: timeAgo(lead.receivedAt), hint: new Date(lead.receivedAt).toLocaleDateString("en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "short", year: "numeric" }), tone: "#2b4fc0" },
          { label: "First reply", value: responseMs !== null ? duration(responseMs) : "Waiting", hint: responseMs !== null ? "Time to first contact" : `${duration(now - new Date(lead.receivedAt).getTime())} so far`, tone: responseMs !== null ? "#16a34a" : "#f59e0b" },
          { label: "Follow-ups", value: String(openTasks.length), hint: overdueTasks > 0 ? `${overdueTasks} overdue` : openTasks.length ? "None overdue" : "Nothing planned", tone: overdueTasks > 0 ? "#f43f5e" : "#8b5cf6" },
          { label: "Activity", value: String(lead.activities.length), hint: "Entries on the timeline", tone: "#06b6d4" },
        ].map((t) => (
          <div key={t.label} className="relative overflow-hidden rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm">
            <span className="absolute inset-x-0 top-0 h-1" style={{ background: t.tone }} />
            <div className="text-[12.5px] font-medium text-muted">{t.label}</div>
            <div className="tnum mt-1.5 text-[22px] font-bold leading-none tracking-tight" style={{ color: t.tone }}>{t.value}</div>
            <div className="mt-1.5 truncate text-[12px] text-muted">{t.hint}</div>
          </div>
        ))}
      </div>

      {error && <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-[13.5px] text-danger">{error}</div>}

      {/* Details on the left, activity on the right. On a phone the activity comes first. */}
      <div className="mt-6 grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="order-2 lg:order-1">{detailsColumn}</div>
        <div className="order-1 lg:order-2">{activityColumn}</div>
      </div>
      {addModal}
    </div>
  );
}
