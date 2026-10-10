"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { ListingDTO } from "@/lib/types";
import { Filters, DEFAULT_FILTERS, countActiveFilters, filtersToParams } from "@/lib/filters";
import GroupedResults from "@/components/GroupedResults";
import SegmentedControl from "@/components/SegmentedControl";
import PropertyCardSkeleton from "@/components/PropertyCardSkeleton";
import ListingTable from "@/components/desktop/ListingTable";
import FilterChips from "@/components/desktop/FilterChips";
import { IconSearch, IconFilter, IconClose, IconGrid, IconList } from "@/components/desktop/icons";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { isAdminRole } from "@/lib/roles";

// The filter sheet pulls in range sliders, chip selects and location
// autocomplete - all dead weight until the user actually opens it, so it's
// kept out of the initial bundle for the properties page.
const FilterSheet = dynamic(() => import("@/components/FilterSheet"), { ssr: false });

const PAGE_SIZE = 20;

export default function PropertiesPage() {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = isAdminRole(session?.user?.role);
  const isDesktop = useIsDesktop();

  // Desktop-only: cards or a dense table. Remembered per browser.
  const [view, setViewState] = useState<"grid" | "list">("grid");
  useEffect(() => {
    try {
      if (localStorage.getItem("properties.view") === "list") setViewState("list");
    } catch {}
  }, []);
  function setView(v: "grid" | "list") {
    setViewState(v);
    try {
      localStorage.setItem("properties.view", v);
    } catch {}
  }

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [listings, setListings] = useState<ListingDTO[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  // "loading" covers the initial/reset fetch (new search or filter change);
  // "loadingMore" covers appending the next page during infinite scroll -
  // kept separate so paging in doesn't dim/hide the results already on screen.
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Guards against out-of-order responses: if the user changes the search/filters
  // again before a slower earlier request resolves, only the latest request's
  // response is applied, so results never flicker back to a stale query's data.
  const requestIdRef = useRef(0);

  const fetchListings = useCallback(
    async (pageNum: number, reset: boolean) => {
      if (sessionStatus !== "authenticated") return;
      const requestId = ++requestIdRef.current;
      if (reset) setLoading(true);
      else setLoadingMore(true);
      const params = filtersToParams(filters, { page: String(pageNum), pageSize: String(PAGE_SIZE) });
      if (debouncedQuery) params.set("q", debouncedQuery);
      try {
        const res = await fetch(`/api/listings?${params.toString()}`);
        const data = await res.json();
        if (requestId !== requestIdRef.current) return;
        setListings((prev) => (reset ? data.listings : [...prev, ...data.listings]));
        setTotalPages(data.totalPages);
        setTotal(data.total);
        setPage(pageNum);
      } finally {
        if (requestId === requestIdRef.current) {
          if (reset) setLoading(false);
          else setLoadingMore(false);
        }
      }
    },
    [filters, debouncedQuery, sessionStatus]
  );

  useEffect(() => {
    fetchListings(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, debouncedQuery, sessionStatus]);

  // Infinite scroll: fetch the next page automatically once the sentinel
  // below the list nears the viewport, instead of requiring a tap.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const canLoadMore = page < totalPages;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !canLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !loadingMore) {
          fetchListings(page + 1, false);
        }
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [canLoadMore, loading, loadingMore, page, fetchListings]);

  const activeFilterCount = countActiveFilters(filters);

  const dupCounts = new Map<string, number>();
  for (const l of listings) dupCounts.set(l.dupKey, (dupCounts.get(l.dupKey) ?? 0) + 1);

  const resultsFooter = (
    <>
      {!loading && listings.length > 0 && (
        <>
          <div ref={sentinelRef} className="h-1" />
          {loadingMore && (
            <div className="mt-3 flex flex-col gap-3 lg:mt-6 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-6">
              <PropertyCardSkeleton />
              <PropertyCardSkeleton />
            </div>
          )}
          {!canLoadMore && <div className="py-4 text-center text-[12px] text-muted lg:py-8">You&apos;ve reached the end · {total} propert{total === 1 ? "y" : "ies"}</div>}
        </>
      )}
    </>
  );

  if (isDesktop) {
    return (
      <div>
        <div className="pb-6 pt-10">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-[32px] font-bold leading-none tracking-tight">Properties</h1>
              <p className="mt-2.5 text-[15px] text-muted">Search and filter every listing across the company.</p>
            </div>
          </div>

          <div className="mt-7 flex items-stretch gap-3">
            <div className="flex flex-1 items-center gap-3 rounded-xl border border-border bg-surface px-4 shadow-sm transition-shadow focus-within:border-primary focus-within:ring-4 focus-within:ring-accent-light">
              <IconSearch size={18} className="text-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by location, building, bedrooms, agent or listing ID"
                className="min-w-0 flex-1 bg-transparent py-3.5 text-[15px] outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-muted text-muted hover:text-foreground">
                  <IconClose size={12} strokeWidth={2.6} />
                </button>
              )}
            </div>
            <div className="w-[300px] shrink-0">
              <SegmentedControl
                options={[
                  { label: "All", value: "ALL" },
                  { label: "For Rent", value: "RENT" },
                  { label: "For Sale", value: "SALE" },
                ]}
                value={filters.listingType}
                onChange={(v) => setFilters((f) => ({ ...f, listingType: v }))}
              />
            </div>
            <button
              onClick={() => setSheetOpen(true)}
              className="relative inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-5 text-[14px] font-semibold shadow-sm transition-colors hover:bg-surface-muted"
            >
              <IconFilter size={17} style={{ color: "var(--primary)" }} />
              Filters
              {activeFilterCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white" style={{ background: "var(--accent)" }}>
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4">
            <div className="flex min-h-[32px] flex-wrap items-center gap-3">
              <span className="text-[14px] font-semibold text-foreground">
                {loading && listings.length === 0 ? "Searching…" : `${total} propert${total === 1 ? "y" : "ies"}`}
              </span>
              <FilterChips filters={filters} onChange={setFilters} />
            </div>
            <div className="flex shrink-0 rounded-lg border border-border bg-surface p-0.5 shadow-sm" role="group" aria-label="Layout">
              {([["grid", IconGrid, "Grid view"], ["list", IconList, "List view"]] as const).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-label={label}
                  aria-pressed={view === v}
                  className={`flex h-8 w-9 items-center justify-center rounded-md transition-colors ${view === v ? "bg-accent-light text-primary" : "text-muted hover:text-foreground"}`}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {!loading && listings.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-surface py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-light text-primary">
              <IconSearch size={24} />
            </div>
            <p className="text-[17px] font-semibold">No properties found</p>
            <p className="mt-1 text-[14px] text-muted">Try a different search, or remove some filters.</p>
            {activeFilterCount > 0 && (
              <button onClick={() => setFilters(DEFAULT_FILTERS)} className="mt-5 rounded-lg bg-surface-muted px-4 py-2 text-[13px] font-semibold hover:bg-border">
                Clear all filters
              </button>
            )}
          </div>
        )}

        <div className={loading && listings.length > 0 ? "pointer-events-none opacity-50 transition-opacity" : "transition-opacity"}>
          {view === "grid" ? <GroupedResults listings={listings} /> : listings.length > 0 && <ListingTable listings={listings} dupCounts={dupCounts} />}
        </div>

        {loading && listings.length === 0 && (
          <div className="grid grid-cols-2 gap-6 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <PropertyCardSkeleton key={i} />
            ))}
          </div>
        )}

        {resultsFooter}

        <FilterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} filters={filters} onApply={setFilters} isAdmin={isAdmin} />
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-30 bg-background safe-top pt-4 px-4 pb-3 border-b border-border">
        <h1 className="text-xl font-bold mb-3">Properties</h1>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-3">
            <span className="text-muted">🔍</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search location, building, bedrooms, agent, ID..."
              className="flex-1 min-w-0 outline-none bg-transparent text-[15px]"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-muted text-sm px-1">
                ✕
              </button>
            )}
          </div>
          <button
            onClick={() => setSheetOpen(true)}
            className="relative shrink-0 rounded-xl border border-border bg-surface px-4 flex items-center justify-center active:bg-surface-muted"
            aria-label="Filters"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            {activeFilterCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                style={{ background: "var(--accent)" }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        <div className="mt-3">
          <SegmentedControl
            options={[
              { label: "All", value: "ALL" },
              { label: "For Rent", value: "RENT" },
              { label: "For Sale", value: "SALE" },
            ]}
            value={filters.listingType}
            onChange={(v) => setFilters((f) => ({ ...f, listingType: v }))}
          />
        </div>

        <div className="flex items-center justify-between mt-2.5">
          <div className="text-[12px] text-muted">
            {loading && listings.length === 0 ? "Searching..." : `${total} propert${total === 1 ? "y" : "ies"} found`}
          </div>
          {activeFilterCount > 0 && (
            <button onClick={() => setFilters(DEFAULT_FILTERS)} className="text-[12px] font-semibold" style={{ color: "var(--primary)" }}>
              Clear all filters
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-4">
        {!loading && listings.length === 0 && (
          <div className="text-center py-16 text-muted">
            <div className="text-4xl mb-3">🏠</div>
            <p className="font-medium text-foreground">No properties found</p>
            <p className="text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        )}

        <div className={loading && listings.length > 0 ? "opacity-50 transition-opacity pointer-events-none" : "transition-opacity"}>
          <GroupedResults listings={listings} />
        </div>

        {loading && listings.length === 0 && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <PropertyCardSkeleton key={i} />
            ))}
          </div>
        )}

        {resultsFooter}
      </div>

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        onApply={setFilters}
        isAdmin={isAdmin}
      />
    </div>
  );
}
