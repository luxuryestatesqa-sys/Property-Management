"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { formatMinutes } from "@/lib/dashboardStats";
import { listingCode } from "@/lib/format";

interface Dashboard {
  newLeads: { thisWeek: number; lastWeek: number };
  unassigned: number;
  perAgent: { id: string | null; name: string; count: number }[];
  conversion: { rate: number; won: number; total: number };
  avgFirstResponseMinutes: number | null;
  portals: { portal: "PROPERTY_FINDER" | "QATAR_LIVING" | "PROPERTY_ORYX"; published: number; errors: number; notPublished: number }[];
  activeListings: number;
  topListings: { id: number; name: string; community: string; enquiries: number }[];
  viewings: { id: string; scheduledAt: string; lead: { id: string; name: string }; listing: { id: number; buildingName: string } | null; agent: { name: string } | null }[];
  leases: { id: number; name: string; community: string; leaseEndDate: string; daysLeft: number }[];
}

const PORTAL_LABELS = { PROPERTY_FINDER: "Property Finder", QATAR_LIVING: "Qatar Living", PROPERTY_ORYX: "Property Oryx" } as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

// Charts follow one rule: regular bars are the quiet blue-grey, and only the most important one is the accent.
function Bars({ rows, unit }: { rows: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const top = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-[13px]">
            <span className="truncate text-text-body">{r.label}</span>
            <span className="tnum font-semibold text-primary-dark">
              {r.value}
              {unit ?? ""}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--primary-soft)" }}>
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.value === top && r.value > 0 ? "var(--primary)" : "#d5dbea" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const Card = ({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) => (
  <section className="surface-card p-5">
    <h2 className="label-caps !text-[11px]">{title}</h2>
    {hint && <p className="mt-1 text-[12.5px] text-muted">{hint}</p>}
    <div className="mt-4">{children}</div>
  </section>
);

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const isManager = ["OWNER", "ADMIN", "MANAGER"].includes(session?.user?.role ?? "");

  useEffect(() => {
    if (status === "unauthenticated") return;
    if (status === "authenticated" && !isManager) return void router.replace("/");
    if (status !== "authenticated") return;
    fetch("/api/dashboard")
      .then(async (r) => (r.ok ? setData(await r.json()) : setError("Couldn't load the dashboard")))
      .catch(() => setError("Couldn't load the dashboard"));
  }, [status, isManager, router]);

  const delta = data ? data.newLeads.thisWeek - data.newLeads.lastWeek : 0;
  const kpis = data
    ? [
        { label: "New leads this week", value: String(data.newLeads.thisWeek), hint: data.newLeads.lastWeek === 0 && data.newLeads.thisWeek === 0 ? "No leads yet" : `${delta >= 0 ? "+" : ""}${delta} vs last week`, href: "/leads" },
        { label: "Conversion rate", value: `${data.conversion.rate}%`, hint: `${data.conversion.won} won of ${data.conversion.total} (90 days)` },
        { label: "Avg first response", value: formatMinutes(data.avgFirstResponseMinutes), hint: "Last 30 days" },
        { label: "Unassigned", value: String(data.unassigned), hint: "Leads with no agent", href: "/leads/assignment" },
      ]
    : [];

  return (
    <div className="px-4 pb-24 lg:px-0 lg:pb-10 page-in">
      <div className="pb-4 pt-4 lg:pb-7 lg:pt-10">
        <h1 className="text-xl font-bold lg:text-[28px] lg:leading-none lg:tracking-[-0.025em]">Dashboard</h1>
        <p className="mt-1 text-[13px] text-muted lg:mt-2.5 lg:text-[15px]">How the agency is doing: leads, response time, listings and what is coming up. <Link href="/dashboard/activities" className="font-semibold text-primary hover:underline">See all activities →</Link></p>
      </div>

      {error && <div className="mb-4 rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>}

      <div className="kpi-row stagger grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {(data ? kpis : [1, 2, 3, 4].map((n) => ({ label: `s${n}`, value: "", hint: "", href: undefined as string | undefined }))).map((k, i) => (
          <div key={k.label} className="rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm lg:p-5">
            {data ? (
              <>
                <div className="text-[12.5px] font-medium text-muted">{k.label}</div>
                <div className="kpi-num tnum mt-1.5 text-[26px] font-bold leading-none tracking-tight lg:mt-2 lg:text-[30px]">{k.value}</div>
                <div className="mt-1.5 text-[12px] text-muted lg:mt-2">
                  {k.href ? (
                    <Link href={k.href} className="hover:underline">
                      {k.hint}
                    </Link>
                  ) : (
                    k.hint
                  )}
                </div>
              </>
            ) : (
              <div className="h-[72px] animate-pulse rounded-lg" style={{ opacity: 1 - i * 0.1 }} />
            )}
          </div>
        ))}
      </div>

      {data && (
        <div className="stagger mt-5 grid gap-4 lg:grid-cols-2 lg:gap-5">
          <Card title="Leads per agent" hint="Received in the last 30 days">
            {data.perAgent.length === 0 ? <p className="text-[13px] text-muted">No leads in the last 30 days.</p> : <Bars rows={data.perAgent.map((a) => ({ label: a.name, value: a.count }))} />}
          </Card>

          <Card title="Listings per portal" hint={`${data.activeListings} active listings`}>
            <ul className="flex flex-col gap-4">
              {data.portals.map((p) => (
                <li key={p.portal}>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className="text-text-body">{PORTAL_LABELS[p.portal]}</span>
                    <span className="tnum font-semibold text-primary-dark">
                      {p.published} <span className="font-normal text-muted">published</span>
                      {p.errors > 0 && <span className="ml-2 text-danger">{p.errors} error{p.errors === 1 ? "" : "s"}</span>}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--primary-soft)" }}>
                    <div className="h-full rounded-full" style={{ width: `${data.activeListings ? (p.published / data.activeListings) * 100 : 0}%`, background: "#d5dbea" }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Top listings by enquiries">
            {data.topListings.length === 0 ? (
              <p className="text-[13px] text-muted">No leads are linked to a property yet.</p>
            ) : (
              <Bars rows={data.topListings.map((l) => ({ label: `${listingCode(l.id)} · ${l.name}`, value: l.enquiries }))} />
            )}
          </Card>

          <Card title="Upcoming viewings" hint="Next 7 days">
            {data.viewings.length === 0 ? (
              <p className="text-[13px] text-muted">No viewings booked.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {data.viewings.map((v) => (
                  <li key={v.id} className="py-2.5 first:pt-0 last:pb-0">
                    <Link href={`/leads/${v.lead.id}`} className="flex items-center justify-between gap-3 text-[13.5px]">
                      <span className="min-w-0 truncate">
                        <b className="font-semibold text-text">{v.lead.name}</b>
                        <span className="text-muted">{v.listing ? ` · ${v.listing.buildingName}` : ""}{v.agent ? ` · ${v.agent.name}` : ""}</span>
                      </span>
                      <span className="tnum shrink-0 text-[12.5px] text-muted">{when(v.scheduledAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {data.leases.length > 0 && (
            <Card title="Leases ending soon" hint="Within 60 days">
              <ul className="flex flex-col divide-y divide-border">
                {data.leases.map((l) => (
                  <li key={l.id} className="py-2.5 first:pt-0 last:pb-0">
                    <Link href={`/property/${l.id}`} className="flex items-center justify-between gap-3 text-[13.5px]">
                      <span className="min-w-0 truncate">
                        <b className="font-semibold text-text">{l.name}</b>
                        <span className="text-muted"> · {l.community}</span>
                      </span>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={l.daysLeft <= 30 ? { background: "var(--warning-soft)", color: "var(--warning)" } : { background: "var(--background)", color: "var(--text-muted)" }}>
                        {l.daysLeft < 0 ? `${-l.daysLeft} d overdue` : `${l.daysLeft} d left`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
