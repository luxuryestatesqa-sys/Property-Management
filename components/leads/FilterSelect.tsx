"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "@/components/Avatar";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
  avatar?: { name: string; avatarUrl: string | null };
  color?: string | null; // a coloured dot, e.g. a lead stage
}

// A dropdown filter for toolbars. With `searchable` it has a search box at the top of the list.
export default function FilterSelect({ value, onChange, options, allValue, label, searchable, searchPlaceholder, width = 220 }: { value: string; onChange: (v: string) => void; options: FilterOption[]; allValue: string; label: string; searchable?: boolean; searchPlaceholder?: string; width?: number }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  }, [options, q]);
  const active = value !== allValue;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQ("");
  }

  return (
    <div className="relative w-full shrink-0 sm:w-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className={`flex h-[46px] w-full items-center gap-2 rounded-xl border bg-surface pl-3 pr-2.5 text-[13px] font-medium shadow-sm outline-none transition-colors focus-visible:ring-4 focus-visible:ring-accent-light sm:w-auto sm:gap-2.5 sm:pl-3.5 sm:pr-3 sm:text-[13.5px] sm:min-w-[var(--fs-min)] ${active ? "border-primary text-primary" : "border-border text-slate-700 hover:bg-slate-50"}`}
        style={{ ["--fs-min" as string]: `${width}px` }}
      >
        {current?.avatar && <Avatar name={current.avatar.name} avatarUrl={current.avatar.avatarUrl} size={22} />}
        {current?.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: current.color }} />}
        <span className="min-w-0 flex-1 truncate text-left">{current?.label}</span>
        {current?.count !== undefined && <span className="tnum hidden rounded-full sm:inline bg-surface-muted px-1.5 py-0.5 text-[11px] font-semibold leading-none text-muted">{current.count}</span>}
        <svg className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[52px] z-40 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface shadow-xl sm:w-auto" style={{ minWidth: Math.max(width, 260) }}>
            {searchable && (
              <div className="border-b border-border p-2">
                <div className="flex items-center gap-2 rounded-lg bg-surface-muted px-3">
                  <svg className="shrink-0 text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input ref={inputRef} autoFocus data-bare value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder ?? "Search…"} className="min-w-0 flex-1 bg-transparent py-2.5 text-[13.5px] outline-none" />
                </div>
              </div>
            )}
            <ul role="listbox" className="max-h-72 overflow-y-auto p-1.5">
              {filtered.map((o) => {
                const on = o.value === value;
                return (
                  <li key={o.value}>
                    <button type="button" role="option" aria-selected={on} onClick={() => pick(o.value)} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors ${on ? "bg-accent-light font-semibold text-primary" : "hover:bg-surface-muted"}`}>
                      {o.avatar && <Avatar name={o.avatar.name} avatarUrl={o.avatar.avatarUrl} size={22} />}
                      {o.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.color }} />}
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {o.count !== undefined && <span className="tnum text-[12px] text-muted">{o.count}</span>}
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && <li className="px-3 py-4 text-center text-[13px] text-muted">No match</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
