"use client";

import { useCallback, useEffect, useState } from "react";
import { ListingDTO } from "@/lib/types";
import MyListingCard from "@/components/MyListingCard";
import MyListingCardSkeleton from "@/components/MyListingCardSkeleton";
import MyListingsTable from "@/components/desktop/MyListingsTable";
import MyListingsGrid from "@/components/desktop/MyListingsGrid";
import { IconGrid, IconList } from "@/components/desktop/icons";
import { IconPlus } from "@/components/desktop/icons";
import { useIsDesktop } from "@/lib/useIsDesktop";
import Link from "next/link";

type Tab = "ACTIVE" | "INACTIVE";

export default function MyListingsPage() {
  const [tab, setTab] = useState<Tab>("ACTIVE");
  const [view, setViewState] = useState<"grid" | "table">("grid");
  useEffect(() => {
    try {
      if (localStorage.getItem("mylistings.view") === "table") setViewState("table");
    } catch {}
  }, []);
  function setView(v: "grid" | "table") {
    setViewState(v);
    try {
      localStorage.setItem("mylistings.view", v);
    } catch {}
  }
  const [listingsByTab, setListingsByTab] = useState<Record<Tab, ListingDTO[]>>({ ACTIVE: [], INACTIVE: [] });
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ ACTIVE: 0, INACTIVE: 0 });

  // Both tabs' data is fetched together, so switching tabs is instant - no
  // refetch or loading flash on every tap, only on first load and after a
  // status/availability change.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [activeRes, inactiveRes] = await Promise.all([
        fetch(`/api/listings?mine=1&status=ACTIVE&page=1`),
        fetch(`/api/listings?mine=1&status=INACTIVE&page=1`),
      ]);
      const activeData = await activeRes.json();
      const inactiveData = await inactiveRes.json();
      setCounts({ ACTIVE: activeData.total, INACTIVE: inactiveData.total });
      setListingsByTab({ ACTIVE: activeData.listings, INACTIVE: inactiveData.listings });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const listings = listingsByTab[tab];
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    const complete = listingsByTab.ACTIVE.length === counts.ACTIVE;
    const availableNow = listingsByTab.ACTIVE.filter((l) => l.availabilityStatus === "AVAILABLE").length;
    const livePf = listingsByTab.ACTIVE.filter((l) => l.propertyFinderState?.state === "live").length;
    const stats: { label: string; value: string; hint: string }[] = [
      { label: "Active listings", value: String(counts.ACTIVE), hint: "Visible to every agent" },
      { label: "Inactive", value: String(counts.INACTIVE), hint: "Hidden from search" },
      { label: "Available now", value: complete ? String(availableNow) : "—", hint: "Ready to rent or sell" },
      { label: "Live on Property Finder", value: complete ? String(livePf) : "—", hint: "Published to the portal" },
    ];
    return (
      <div>
        <div className="flex items-end justify-between gap-6 pb-7 pt-10">
          <div>
            <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">My Listings</h1>
            <p className="mt-2.5 text-[15px] text-muted">Manage the properties you have added: availability, publishing and visibility.</p>
          </div>
          <Link
            href="/add"
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ background: "var(--primary)" }}
          >
            <IconPlus size={16} strokeWidth={2.4} />
            Add Property
          </Link>
        </div>

        <div className="kpi-row grid grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-surface p-5">
              <div className="text-[12.5px] font-medium text-muted">{s.label}</div>
              <div className="kpi-num tnum mt-2 text-[30px] font-bold leading-none tracking-tight">{loading ? <span className="inline-block h-7 w-10 animate-pulse rounded bg-surface-muted" /> : s.value}</div>
              <div className="mt-2 text-[12px] text-muted">{s.hint}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-end justify-between border-b border-border">
          <div className="flex gap-7">
          {(["ACTIVE", "INACTIVE"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 pb-3 text-[14px] font-semibold transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"}`}
            >
              {t === "ACTIVE" ? "Active" : "Inactive"}
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[11.5px] ${tab === t ? "bg-accent-light" : "bg-surface-muted"}`}>{counts[t]}</span>
            </button>
          ))}
          </div>
          <div className="mb-2 flex rounded-lg border border-border bg-surface p-0.5 shadow-sm" role="group" aria-label="Layout">
            {([["grid", IconGrid, "Grid view"], ["table", IconList, "Table view"]] as const).map(([v, Icon, label]) => (
              <button key={v} type="button" onClick={() => setView(v)} aria-label={label} aria-pressed={view === v} className={`flex h-9 w-10 items-center justify-center rounded-md transition-colors ${view === v ? "bg-slate-100 text-slate-900" : "text-muted hover:text-foreground"}`}>
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>

        <div className="py-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[76px] animate-pulse rounded-2xl border border-border bg-surface" />
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface py-20 text-center">
              <p className="text-[17px] font-semibold">No {tab === "ACTIVE" ? "active" : "inactive"} listings</p>
              <p className="mt-1 text-[14px] text-muted">{tab === "ACTIVE" ? "Properties you add will appear here." : "Deactivated listings will appear here."}</p>
            </div>
          ) : (
            view === "grid" ? <MyListingsGrid listings={listings} onChange={load} /> : <MyListingsTable listings={listings} onChange={load} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-20 glass safe-top pt-4 pb-3 px-4 border-b border-border">
        <h1 className="text-xl font-bold mb-3">My Listings</h1>
        <div className="flex bg-surface-muted rounded-xl p-1 gap-1">
          {(["ACTIVE", "INACTIVE"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 text-[14px] font-medium py-2.5 rounded-lg ${tab === t ? "bg-surface shadow-sm" : "text-muted"}`}
              style={tab === t ? { color: "var(--primary)" } : undefined}
            >
              {t === "ACTIVE" ? "Active" : "Inactive"} ({counts[t]})
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <MyListingCardSkeleton key={i} />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16 text-muted">
            <div className="text-4xl mb-3">📋</div>
            <p className="font-medium text-foreground">No {tab === "ACTIVE" ? "active" : "inactive"} listings</p>
            <p className="text-sm mt-1">
              {tab === "ACTIVE" ? "Properties you add will appear here." : "Deactivated listings will appear here."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {listings.map((l) => (
              <MyListingCard key={l.id} listing={l} onStatusChange={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
