"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ListingDTO } from "@/lib/types";
import { Filters, DEFAULT_FILTERS, countActiveFilters, filtersToParams } from "@/lib/filters";
import FilterSheet from "@/components/FilterSheet";
import GroupedResults from "@/components/GroupedResults";
import SegmentedControl from "@/components/SegmentedControl";

export default function PropertiesPage() {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [listings, setListings] = useState<ListingDTO[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

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
      setLoading(true);
      const params = filtersToParams(filters, { page: String(pageNum) });
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
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [filters, debouncedQuery, sessionStatus]
  );

  useEffect(() => {
    fetchListings(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, debouncedQuery, sessionStatus]);

  const activeFilterCount = countActiveFilters(filters);

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
              placeholder="Search location, building, agent, ID..."
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
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl bg-surface border border-border p-4 h-40 animate-pulse" />
            ))}
          </div>
        )}

        {page < totalPages && (
          <button
            onClick={() => fetchListings(page + 1, false)}
            disabled={loading}
            className="w-full mt-4 rounded-xl py-3.5 text-[14px] font-semibold bg-surface-muted text-foreground active:opacity-70 disabled:opacity-60"
          >
            {loading ? "Loading..." : "Load More"}
          </button>
        )}
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
