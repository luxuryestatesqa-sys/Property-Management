"use client";

import { useEffect, useRef, useState } from "react";

interface LocationAutocompleteProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  level: "area" | "community" | "building";
  area?: string;
  community?: string;
  disabled?: boolean;
}

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
      .then((d) => setOptions(d.values ?? []))
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
          {filtered.slice(0, 20).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className="w-full text-left px-4 py-3 text-[15px] active:bg-surface-muted border-b border-border last:border-b-0"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
