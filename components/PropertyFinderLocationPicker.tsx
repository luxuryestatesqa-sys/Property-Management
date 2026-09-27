"use client";

import { useEffect, useRef, useState } from "react";

interface PFLocationOption {
  id: number;
  name: string;
  path: string;
}

interface PropertyFinderLocationPickerProps {
  value: number | null;
  // Best-known display label for `value` (e.g. from a prior search this
  // session) - we never re-resolve an id back to a name, so this is shown
  // as a fallback until the agent searches again.
  valueLabel?: string | null;
  onChange: (id: number | null, label: string | null) => void;
}

// Live, debounced search against Property Finder's own location tree - see
// app/api/portals/propertyfinder/locations/route.ts. Deliberately not a
// client-side filter over a prefetched list: PF's location tree is far too
// large for that, and PF's own docs recommend manual search-and-pick over
// any kind of auto-matching, to avoid misassigning the listing.
export default function PropertyFinderLocationPicker({ value, valueLabel, onChange }: PropertyFinderLocationPickerProps) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PFLocationOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setOptions([]);
      return;
    }
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/portals/propertyfinder/locations?search=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Search failed");
          setOptions([]);
          return;
        }
        setOptions(data.locations);
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div ref={containerRef} className="relative">
      <label className="text-sm font-medium text-foreground block mb-1.5">Property Finder Location</label>
      {value && !open && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface-muted px-4 py-3 mb-2 text-[14px]">
          <span className="truncate">{valueLabel ?? `Location #${value}`}</span>
          <button type="button" onClick={() => setOpen(true)} className="shrink-0 text-[12px] font-semibold ml-2" style={{ color: "var(--primary)" }}>
            Change
          </button>
        </div>
      )}
      {(!value || open) && (
        <>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search Property Finder locations, e.g. Lusail, The Pearl"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
          />
          {open && (loading || error || options.length > 0) && (
            <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
              {loading && <div className="px-4 py-3 text-[14px] text-muted">Searching...</div>}
              {!loading && error && <div className="px-4 py-3 text-[14px] text-danger">{error}</div>}
              {!loading &&
                !error &&
                options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange(opt.id, opt.path);
                      setQuery("");
                      setOptions([]);
                      setOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 text-[14px] active:bg-surface-muted border-b border-border last:border-b-0"
                  >
                    {opt.path}
                  </button>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
