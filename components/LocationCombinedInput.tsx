"use client";

import { useEffect, useRef, useState } from "react";
import type { LocationSuggestion } from "@/lib/qatarLocations";

interface LocationCombinedInputProps {
  area: string;
  community: string;
  onChange: (area: string, community: string) => void;
}

function combineDisplay(area: string, community: string): string {
  if (!area && !community) return "";
  if (!community || community.trim().toLowerCase() === area.trim().toLowerCase()) return area;
  return `${community}, ${area}`;
}

// A single "Location" field standing in for what used to be two separate
// boxes (Location, then Area/Community) - agents found filling both
// confusing. Typing or picking a suggestion resolves both the area and the
// specific precinct/community in one step; freehand text not in the list
// falls back to using the same text for both.
export default function LocationCombinedInput({ area, community, onChange }: LocationCombinedInputProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [text, setText] = useState(() => combineDisplay(area, community));
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/locations?level=combined")
      .then((r) => r.json())
      .then((d) => setSuggestions(d.suggestions ?? []))
      .catch(() => setSuggestions([]));
  }, []);

  useEffect(() => {
    setText(combineDisplay(area, community));
  }, [area, community]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const trimmed = text.trim();
  const filtered = trimmed
    ? suggestions.filter((s) => s.display.toLowerCase().includes(trimmed.toLowerCase())).slice(0, 20)
    : [];

  function pick(s: LocationSuggestion) {
    onChange(s.area, s.community);
    setText(s.display);
    setOpen(false);
  }

  function handleBlur() {
    // Don't close the dropdown here - a click on a suggestion button blurs
    // the input first, and closing immediately would unmount the button
    // before its click ever registers. The click-outside listener above
    // already closes the dropdown for every other case.
    const current = combineDisplay(area, community);
    if (trimmed !== current) {
      onChange(trimmed, trimmed || "");
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="text-sm font-medium text-foreground block mb-1.5">Location</label>
      <input
        type="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        placeholder="e.g. Lusail Marina, Porto Arabia, West Bay..."
        className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
          {filtered.map((s) => (
            <button
              key={s.display}
              type="button"
              onClick={() => pick(s)}
              className="w-full text-left px-4 py-3 text-[15px] active:bg-surface-muted border-b border-border last:border-b-0"
            >
              {s.display}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
