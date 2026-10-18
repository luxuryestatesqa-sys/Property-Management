"use client";

import { useEffect, useRef, useState } from "react";
import { IconPin, IconClose, IconCheck } from "./icons";

interface PFOption {
  id: number;
  name: string;
  path: string;
}

export interface PickedLocation {
  area: string;
  community: string;
  pfLocationId: number | null;
  label: string;
}

interface Props {
  area: string;
  community: string;
  pfLocationId: number | null;
  label: string;
  onChange: (v: PickedLocation) => void;
}

// Location search backed by Property Finder's own location tree (live, debounced,
// via /api/portals/propertyfinder/locations - credentials stay server-side).
// Picking a result stores PF's id, so the listing publishes to exactly that place.
// If the place isn't in Property Finder (or PF isn't connected), the agent can
// always use what they typed as a custom location.
export default function PfLocationPicker({ area, community, pfLocationId, label, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PFOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const q = query.trim();
  const hasValue = Boolean(area.trim() && community.trim());

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (q.length < 2) {
      setOptions([]);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/portals/propertyfinder/locations?search=${encodeURIComponent(q)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "Property Finder search is unavailable");
          setOptions([]);
        } else {
          setOptions(data.locations ?? []);
        }
      } catch {
        if (!cancelled) setError("Couldn't reach Property Finder");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  // total selectable rows = PF results + the custom row
  const rows = q.length >= 2 ? options.length + 1 : 0;
  useEffect(() => setActive(0), [options, q]);

  function pickPf(o: PFOption) {
    const parts = o.path.split(", ");
    const name = parts[parts.length - 1] || o.name;
    const parent = parts.length > 1 ? parts[parts.length - 2] : name;
    onChange({ area: parent, community: name, pfLocationId: o.id, label: o.path });
    reset();
  }
  function pickCustom() {
    onChange({ area: q, community: q, pfLocationId: null, label: q });
    reset();
  }
  function reset() {
    setQuery("");
    setOptions([]);
    setOpen(false);
  }
  function clear() {
    onChange({ area: "", community: "", pfLocationId: null, label: "" });
    setTimeout(() => input.current?.focus(), 30);
  }

  if (hasValue) {
    const fromPf = pfLocationId !== null;
    return (
      <div>
        <span className="mb-2 block text-[13.5px] font-semibold text-slate-700">Location</span>
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3 sm:items-center sm:px-4 sm:py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-light text-primary">
            <IconPin size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="break-words text-[15px] font-medium leading-snug">{label || `${community}, ${area}`}</div>
            <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[12px] text-muted">
              {fromPf ? (
                <>
                  <IconCheck size={12} className="text-emerald-600" /> From Property Finder
                </>
              ) : (
                "Custom location"
              )}
            </div>
          </div>
          <button type="button" onClick={clear} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900 sm:px-2.5">
            <IconClose size={13} />
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <label className="mb-2 block text-[13.5px] font-semibold text-slate-700">Location</label>
      <input
        ref={input}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!rows) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, rows - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (active < options.length) pickPf(options[active]);
            else pickCustom();
          }
        }}
        placeholder="Search a location, e.g. Lusail, The Pearl, West Bay…"
        autoComplete="off"
        className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-[15px] outline-none"
      />
      <p className="mt-1.5 text-[12px] text-muted">Suggestions come from Property Finder. Not listed? You can add your own.</p>

      {open && q.length >= 2 && (
        <div className="page-in absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl bg-white shadow-[0_12px_32px_-8px_rgba(30,27,75,0.28),0_0_0_1px_rgba(30,27,75,0.07)]">
          <div className="max-h-72 overflow-y-auto py-1.5">
            {loading && <div className="px-4 py-3 text-[14px] text-muted">Searching Property Finder…</div>}
            {!loading && error && <div className="px-4 py-3 text-[13px] text-amber-700">{error}. You can still use a custom location below.</div>}
            {!loading && !error && options.length === 0 && <div className="px-4 py-3 text-[13px] text-muted">No Property Finder match for “{q}”.</div>}
            {options.map((o, i) => (
              <button
                key={o.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pickPf(o)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${active === i ? "bg-accent-light" : ""}`}
              >
                <IconPin size={15} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium">{o.name}</span>
                  <span className="block truncate text-[12px] text-muted">{o.path}</span>
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onMouseEnter={() => setActive(options.length)}
            onClick={pickCustom}
            className={`flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left transition-colors ${active === options.length ? "bg-accent-light" : "bg-slate-50"}`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[15px] font-semibold text-primary ring-1 ring-slate-200">+</span>
            <span className="min-w-0 flex-1 truncate text-[14px]">
              Use <strong className="font-semibold">“{q}”</strong> as a custom location
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
