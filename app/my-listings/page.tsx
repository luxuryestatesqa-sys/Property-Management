"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ListingDTO } from "@/lib/types";
import MyListingCard from "@/components/MyListingCard";
import MyListingCardSkeleton from "@/components/MyListingCardSkeleton";
import MyListingsTable from "@/components/desktop/MyListingsTable";
import MyListingsGrid from "@/components/desktop/MyListingsGrid";
import { IconGrid, IconList } from "@/components/desktop/icons";
import { IconPlus } from "@/components/desktop/icons";
import { useHydrated, useIsDesktop } from "@/lib/useIsDesktop";
import Link from "next/link";
import { listingCode } from "@/lib/format";
import { AVAILABILITY_LABELS } from "@/lib/availability";

type Tab = "ACTIVE" | "INACTIVE";
type TypeFilter = "ALL" | "RENT" | "SALE";
type Sort = "newest" | "oldest" | "price-high" | "price-low";

const SORTS: [Sort, string][] = [
  ["newest", "Newest first"],
  ["oldest", "Oldest first"],
  ["price-high", "Price: high to low"],
  ["price-low", "Price: low to high"],
];
const priceOf = (l: ListingDTO) => (l.listingType === "RENT" ? l.rentPrice : l.salePrice) ?? 0;

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
  // null until the first answer arrives, so a tab never claims "0" while it is still loading
  const [counts, setCounts] = useState<{ ACTIVE: number | null; INACTIVE: number | null }>({ ACTIVE: null, INACTIVE: null });

  // Both tabs' data is fetched together, so switching tabs is instant - no
  // refetch or loading flash on every tap, only on first load and after a
  // status/availability change.
  // Only the first load shows placeholders; later reloads (after a status change) update in place, so the
  // list does not blink away and the page does not jump back to the top.
  const load = useCallback(async () => {
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

  const tabListings = listingsByTab[tab];

  // Search and filters work on what is already loaded, so they answer as you type.
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [availability, setAvailability] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const filtersOn = Boolean(query.trim() || typeFilter !== "ALL" || availability);
  const listings = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = tabListings.filter((l) => {
      if (typeFilter !== "ALL" && l.listingType !== typeFilter) return false;
      if (availability && l.availabilityStatus !== availability) return false;
      if (!q) return true;
      return [l.buildingName, l.area, l.community, l.title ?? "", listingCode(l.id), String(l.id)].some((x) => x.toLowerCase().includes(q));
    });
    const by = (a: ListingDTO, b: ListingDTO) =>
      sort === "oldest" ? +new Date(a.createdAt) - +new Date(b.createdAt) : sort === "price-high" ? priceOf(b) - priceOf(a) : sort === "price-low" ? priceOf(a) - priceOf(b) : +new Date(b.createdAt) - +new Date(a.createdAt);
    return [...rows].sort(by);
  }, [tabListings, query, typeFilter, availability, sort]);
  const clearFilters = () => {
    setQuery("");
    setTypeFilter("ALL");
    setAvailability("");
  };
  const isDesktop = useIsDesktop();
  const hydrated = useHydrated();

  // Until the browser has decided between the phone and desktop layouts, show one neutral placeholder.
  if (!hydrated) {
    return (
      <div className="px-4 pt-6 lg:px-0 lg:pt-10">
        <div className="h-8 w-44 animate-pulse rounded-lg bg-surface-muted" />
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-2xl border border-border bg-surface" />
          ))}
        </div>
      </div>
    );
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-border bg-white px-3.5 shadow-sm focus-within:border-primary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-muted" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input data-bare value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search building, area or LST code" aria-label="Search my listings" className="h-11 min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-muted hover:text-foreground">
            ✕
          </button>
        )}
      </div>
      <div className="flex rounded-xl p-1" style={{ background: "var(--primary-soft)" }} role="group" aria-label="Rent or sale">
        {(["ALL", "RENT", "SALE"] as TypeFilter[]).map((t) => (
          <button key={t} type="button" onClick={() => setTypeFilter(t)} aria-pressed={typeFilter === t} className={`rounded-lg px-3.5 py-2 text-[13px] font-semibold transition ${typeFilter === t ? "bg-white text-primary shadow-sm" : "text-muted hover:text-foreground"}`}>
            {t === "ALL" ? "All" : t === "RENT" ? "For rent" : "For sale"}
          </button>
        ))}
      </div>
      <select value={availability} onChange={(e) => setAvailability(e.target.value)} aria-label="Availability" className="h-11 rounded-xl border border-border bg-white px-3 text-[13.5px] font-medium shadow-sm">
        <option value="">Any status</option>
        {Object.entries(AVAILABILITY_LABELS).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="h-11 rounded-xl border border-border bg-white px-3 text-[13.5px] font-medium shadow-sm">
        {SORTS.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      {filtersOn && (
        <button type="button" onClick={clearFilters} className="h-11 rounded-xl px-3 text-[13.5px] font-semibold text-primary hover:bg-primary-soft">
          Clear
        </button>
      )}
    </div>
  );
  const noMatches = !loading && tabListings.length > 0 && listings.length === 0;
  const noMatchesBox = (
    <div className="rounded-2xl border border-dashed border-border bg-surface py-14 text-center">
      <p className="text-[16px] font-semibold">No listings match</p>
      <p className="mt-1 text-[13.5px] text-muted">Try a different search or clear the filters.</p>
      <button type="button" onClick={clearFilters} className="mt-4 rounded-xl px-5 py-2.5 text-[13.5px] font-semibold text-white" style={{ background: "var(--primary)" }}>
        Clear filters
      </button>
    </div>
  );

  if (isDesktop) {
    const complete = counts.ACTIVE !== null && listingsByTab.ACTIVE.length === counts.ACTIVE;
    const availableNow = listingsByTab.ACTIVE.filter((l) => l.availabilityStatus === "AVAILABLE").length;
    const livePf = listingsByTab.ACTIVE.filter((l) => l.propertyFinderState?.state === "live").length;
    const stats: { label: string; value: string; hint: string; tab?: Tab }[] = [
      { label: "Active listings", value: String(counts.ACTIVE ?? "–"), hint: "Visible to every agent", tab: "ACTIVE" },
      { label: "Inactive", value: String(counts.INACTIVE ?? "–"), hint: "Hidden from search", tab: "INACTIVE" },
      { label: "Available now", value: complete ? String(availableNow) : "—", hint: "Ready to rent or sell" },
      { label: "Live on Property Finder", value: complete ? String(livePf) : "—", hint: "Published to the portal" },
    ];
    const ACCENTS = ["#2b4fc0", "#f59e0b", "#16a34a", "#8b5cf6"];
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

        {/* The first two cards are shortcuts to the tabs, and the one for the open tab is lit. */}
        <div className="grid grid-cols-4 gap-4">
          {stats.map((s, i) => {
            const on = s.tab === tab;
            const cls = `relative overflow-hidden rounded-2xl border p-5 text-left transition-shadow ${on ? "border-transparent text-white shadow-lg" : "border-border bg-surface"} ${s.tab ? "cursor-pointer hover:shadow-md" : ""}`;
            const body = (
              <>
                {!on && <span className="absolute inset-x-0 top-0 h-1" style={{ background: ACCENTS[i] }} />}
                <div className={`text-[12.5px] font-medium ${on ? "text-white/80" : "text-muted"}`}>{s.label}</div>
                <div className={`tnum mt-2 text-[30px] font-bold leading-none tracking-tight ${on ? "text-white" : ""}`} style={on ? undefined : { color: ACCENTS[i] }}>{loading ? <span className={`inline-block h-7 w-10 animate-pulse rounded ${on ? "bg-white/30" : "bg-surface-muted"}`} /> : s.value}</div>
                <div className={`mt-2 text-[12px] ${on ? "text-white/75" : "text-muted"}`}>{s.hint}</div>
              </>
            );
            const style = on ? { backgroundImage: "var(--gradient-primary)", backgroundColor: "var(--primary-dark)" } : undefined;
            return s.tab ? (
              <button key={s.label} type="button" onClick={() => setTab(s.tab!)} aria-pressed={on} className={cls} style={style}>{body}</button>
            ) : (
              <div key={s.label} className={cls}>{body}</div>
            );
          })}
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
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[11.5px] ${tab === t ? "bg-accent-light" : "bg-surface-muted"}`}>{counts[t] ?? "–"}</span>
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

        <div className="pt-5">
          {toolbar}
          {!loading && tabListings.length > 0 && <p className="mt-3 text-[12.5px] text-muted">{filtersOn ? `${listings.length} of ${tabListings.length} listings` : `${tabListings.length} listing${tabListings.length === 1 ? "" : "s"}`}</p>}
        </div>

        <div className="py-5">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[76px] animate-pulse rounded-2xl border border-border bg-surface" />
              ))}
            </div>
          ) : noMatches ? (
            noMatchesBox
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
              {t === "ACTIVE" ? "Active" : "Inactive"} ({counts[t] ?? "–"})
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-4 pt-3">
        {tabListings.length > 0 && <div className="mb-3">{toolbar}</div>}
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <MyListingCardSkeleton key={i} />
            ))}
          </div>
        ) : noMatches ? (
          noMatchesBox
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
