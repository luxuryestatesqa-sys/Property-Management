"use client";

import { useEffect, useRef, useState } from "react";

interface SearchableSelectOption {
  label: string;
  value: string;
}

interface SearchableSelectProps {
  label?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: SearchableSelectOption[];
  placeholder?: string; // shown for the "clear" row and when nothing is selected
  searchPlaceholder?: string;
  disabled?: boolean;
}

// A type-to-filter dropdown for pickers with too many options to scan by eye
// (agents, buildings, ...) - a plain <select> makes those a scroll-fest with
// no way to jump straight to what you're typing.
export default function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "All",
  searchPlaceholder = "Search...",
  disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isOpen = open && !disabled;
  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  function select(v: string | null) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      {label && <label className="text-sm font-medium text-foreground block mb-1.5">{label}</label>}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3.5 text-base text-left active:bg-surface-muted disabled:bg-surface-muted disabled:text-muted"
      >
        <span className={`truncate ${selected ? "text-foreground font-medium" : "text-muted"}`}>{selected ? selected.label : placeholder}</span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted shrink-0 transition-transform"
          style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-surface shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg bg-surface-muted px-3 py-2.5 text-[15px] outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto no-scrollbar">
            <button
              type="button"
              onClick={() => select(null)}
              className="w-full text-left px-4 py-3 text-[15px] active:bg-surface-muted"
              style={!value ? { color: "var(--primary)", fontWeight: 600 } : undefined}
            >
              {placeholder}
            </button>
            {filtered.length === 0 && <div className="px-4 py-3 text-[14px] text-muted">No matches</div>}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => select(o.value)}
                className="w-full text-left px-4 py-3 text-[15px] active:bg-surface-muted border-t border-border"
                style={o.value === value ? { color: "var(--primary)", fontWeight: 600 } : undefined}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
