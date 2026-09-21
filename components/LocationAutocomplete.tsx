"use client";

import { useEffect, useRef, useState } from "react";
import { QATAR_COMMUNITY_TO_AREA } from "@/lib/qatarLocations";

interface LocationAutocompleteProps {
  label: string;
  placeholder: string;
  value: string;
  // resolvedCommunity is set when the picked suggestion was actually a known
  // precinct (e.g. picking "Lusail Marina" in the "area" field calls
  // onChange("Lusail", "Lusail Marina")), so the caller can auto-fill the
  // Area/Community field along with it.
  onChange: (value: string, resolvedCommunity?: string) => void;
  level: "area" | "community" | "building";
  area?: string;
  community?: string;
  disabled?: boolean;
}

// So typing a precinct name (e.g. "Marina") in the top-level Location field
// surfaces "Lusail Marina" directly, instead of requiring the area to be
// picked first.
const KNOWN_COMMUNITY_NAMES = Object.values(QATAR_COMMUNITY_TO_AREA).map((x) => x.community);

export default function LocationAutocomplete({
  label,
  placeholder,
  value,
  onChange,
  level,
  area,
  community,
  disabled,
}: LocationAutocompleteProps) {
  const [options, setOptions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled) return;
    const params = new URLSearchParams({ level });
    if (level === "community" && area) params.set("area", area);
    if (level === "building") {
      if (area) params.set("area", area);
      if (community) params.set("community", community);
    }
    fetch(`/api/locations?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        const fetched: string[] = d.values ?? [];
        if (level !== "area") {
          setOptions(fetched);
          return;
        }
        const seen = new Set(fetched.map((v) => v.toLowerCase()));
        const merged = [...fetched];
        for (const name of KNOWN_COMMUNITY_NAMES) {
          if (!seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase());
            merged.push(name);
          }
        }
        setOptions(merged);
      })
      .catch(() => setOptions([]));
  }, [level, area, community, disabled]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter((o) => o.toLowerCase().includes(value.toLowerCase()) && o.toLowerCase() !== value.toLowerCase());

  function pick(opt: string) {
    if (level === "area") {
      const hit = QATAR_COMMUNITY_TO_AREA[opt.toLowerCase()];
      if (hit) {
        onChange(hit.area, hit.community);
        setOpen(false);
        return;
      }
    }
    onChange(opt);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="text-sm font-medium text-foreground block mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary disabled:bg-surface-muted disabled:text-muted"
      />
      {open && !disabled && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
          {filtered.slice(0, 20).map((opt) => {
            const hit = level === "area" ? QATAR_COMMUNITY_TO_AREA[opt.toLowerCase()] : undefined;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => pick(opt)}
                className="w-full text-left px-4 py-3 text-[15px] active:bg-surface-muted border-b border-border last:border-b-0"
              >
                {opt}
                {hit && <span className="text-muted text-[12px]"> · {hit.area}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
