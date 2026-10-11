"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { Filters, RENT_BOUNDS, SALE_BOUNDS } from "@/lib/filters";
import { formatCompactQAR } from "@/lib/format";
import { AVAILABILITY_LABELS } from "@/lib/availability";
import { PROPERTY_CATEGORY_LABELS, PROPERTY_CATEGORY_OPTIONS, BEDROOM_LABELS, BEDROOM_OPTIONS } from "@/lib/propertyCategory";
import { IconCheck, IconFilter } from "./icons";

// Filters most agents reach for first, shown in a bar under the search box and
// applied instantly. Everything else lives in the "More filters" drawer.

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Pop({ label, active, children, width = 260 }: { label: ReactNode; active: boolean; children: (close: () => void) => ReactNode; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 text-[13.5px] font-medium transition-colors ${
          active ? "border-primary/40 bg-accent-light text-primary" : "border-border bg-surface text-slate-700 hover:border-slate-300 hover:bg-slate-50"
        }`}
      >
        {label}
        <Chevron />
      </button>
      {open && (
        <div className="page-in absolute left-0 top-12 z-40 rounded-2xl bg-white p-2 shadow-[0_18px_50px_-12px_rgba(30,27,75,0.35),0_0_0_1px_rgba(30,27,75,0.06)]" style={{ width }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function Option({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors hover:bg-slate-100 ${on ? "font-semibold text-primary" : "text-slate-700"}`}>
      {children}
      {on && <IconCheck size={15} strokeWidth={2.6} />}
    </button>
  );
}

const RENT_PRESETS: [string, number | null, number | null][] = [
  ["Under 5K", null, 5000],
  ["5K – 10K", 5000, 10000],
  ["10K – 20K", 10000, 20000],
  ["20K+", 20000, null],
];
const SALE_PRESETS: [string, number | null, number | null][] = [
  ["Under 1M", null, 1_000_000],
  ["1M – 2.5M", 1_000_000, 2_500_000],
  ["2.5M – 5M", 2_500_000, 5_000_000],
  ["5M+", 5_000_000, null],
];

function PriceBody({ filters, onChange, close }: { filters: Filters; onChange: (f: Filters) => void; close: () => void }) {
  const [mode, setMode] = useState<"RENT" | "SALE">(filters.listingType === "SALE" ? "SALE" : "RENT");
  const isRent = mode === "RENT";
  const curMin = isRent ? filters.rentMin : filters.saleMin;
  const curMax = isRent ? filters.rentMax : filters.saleMax;
  const [minText, setMinText] = useState(curMin?.toString() ?? "");
  const [maxText, setMaxText] = useState(curMax?.toString() ?? "");
  const presets = isRent ? RENT_PRESETS : SALE_PRESETS;
  const bounds = isRent ? RENT_BOUNDS : SALE_BOUNDS;

  function apply(min: number | null, max: number | null) {
    // Price only makes sense for one kind of listing at a time, so choosing a
    // price also switches the list to that kind and clears the other price.
    onChange(
      isRent
        ? { ...filters, listingType: "RENT", rentMin: min, rentMax: max, saleMin: null, saleMax: null }
        : { ...filters, listingType: "SALE", saleMin: min, saleMax: max, rentMin: null, rentMax: null, bills: "ALL" }
    );
    close();
  }
  const num = (t: string) => (t.trim() === "" ? null : Math.max(0, Number(t)) || null);

  return (
    <div className="p-2">
      <div className="mb-3 flex rounded-lg bg-slate-100 p-0.5">
        {(["RENT", "SALE"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setMinText("");
              setMaxText("");
            }}
            className={`flex-1 rounded-md py-1.5 text-[12.5px] font-medium transition-all ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
          >
            {m === "RENT" ? "Rent / month" : "Sale price"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {presets.map(([label, mn, mx]) => (
          <button
            key={label}
            type="button"
            onClick={() => apply(mn, mx)}
            className={`rounded-lg border px-2 py-2 text-[12.5px] font-medium transition-colors ${curMin === mn && curMax === mx ? "border-primary bg-accent-light text-primary" : "border-border text-slate-600 hover:bg-slate-50"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input data-bare inputMode="numeric" value={minText} onChange={(e) => setMinText(e.target.value.replace(/[^\d]/g, ""))} placeholder={`Min ${formatCompactQAR(bounds.min)}`} className="tnum w-full rounded-lg border border-border px-3 py-2 text-[13px] outline-none focus:border-primary" />
        <span className="text-slate-300">–</span>
        <input data-bare inputMode="numeric" value={maxText} onChange={(e) => setMaxText(e.target.value.replace(/[^\d]/g, ""))} placeholder={`Max ${formatCompactQAR(bounds.max)}`} className="tnum w-full rounded-lg border border-border px-3 py-2 text-[13px] outline-none focus:border-primary" />
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => apply(null, null)} className="flex-1 rounded-lg bg-slate-100 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-200">
          Clear
        </button>
        <button type="button" onClick={() => apply(num(minText), num(maxText))} className="flex-1 rounded-lg py-2 text-[13px] font-semibold text-white" style={{ background: "var(--primary)" }}>
          Apply
        </button>
      </div>
    </div>
  );
}

export default function QuickFilters({ filters, onChange, onMore, moreCount }: { filters: Filters; onChange: (f: Filters) => void; onMore: () => void; moreCount: number }) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });

  const hasRent = filters.rentMin !== null || filters.rentMax !== null;
  const hasSale = filters.saleMin !== null || filters.saleMax !== null;
  const priceLabel = hasRent || hasSale
    ? `${formatCompactQAR((hasRent ? filters.rentMin : filters.saleMin) ?? 0)} – ${(hasRent ? filters.rentMax : filters.saleMax) !== null ? formatCompactQAR((hasRent ? filters.rentMax : filters.saleMax)!) : "any"}`
    : "Price";

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Pop active={Boolean(filters.propertyCategory)} label={filters.propertyCategory ? PROPERTY_CATEGORY_LABELS[filters.propertyCategory] : "Property type"} width={230}>
        {(close) => (
          <div className="max-h-72 overflow-y-auto">
            <Option on={!filters.propertyCategory} onClick={() => (set("propertyCategory", null), close())}>Any type</Option>
            {PROPERTY_CATEGORY_OPTIONS.map((c) => (
              <Option key={c} on={filters.propertyCategory === c} onClick={() => (set("propertyCategory", c), close())}>{PROPERTY_CATEGORY_LABELS[c]}</Option>
            ))}
          </div>
        )}
      </Pop>

      <Pop active={Boolean(filters.bedrooms)} label={filters.bedrooms ? BEDROOM_LABELS[filters.bedrooms] : "Bedrooms"} width={220}>
        {(close) => (
          <div className="max-h-72 overflow-y-auto">
            <Option on={!filters.bedrooms} onClick={() => (set("bedrooms", null), close())}>Any</Option>
            {BEDROOM_OPTIONS.map((b) => (
              <Option key={b} on={filters.bedrooms === b} onClick={() => (set("bedrooms", b), close())}>{BEDROOM_LABELS[b]}</Option>
            ))}
          </div>
        )}
      </Pop>

      <Pop active={hasRent || hasSale} label={priceLabel} width={300}>
        {(close) => <PriceBody filters={filters} onChange={onChange} close={close} />}
      </Pop>

      <Pop active={filters.furnished !== "ALL"} label={filters.furnished === "ALL" ? "Furnishing" : filters.furnished === "FURNISHED" ? "Furnished" : "Unfurnished"} width={200}>
        {(close) => (
          <>
            {([["ALL", "Any"], ["FURNISHED", "Furnished"], ["UNFURNISHED", "Unfurnished"]] as const).map(([v, l]) => (
              <Option key={v} on={filters.furnished === v} onClick={() => (set("furnished", v), close())}>{l}</Option>
            ))}
          </>
        )}
      </Pop>

      <Pop active={filters.availability !== "ALL"} label={filters.availability === "ALL" ? "Availability" : AVAILABILITY_LABELS[filters.availability]} width={200}>
        {(close) => (
          <>
            <Option on={filters.availability === "ALL"} onClick={() => (set("availability", "ALL"), close())}>Any</Option>
            {(["AVAILABLE", "RESERVED", "RENTED", "SOLD"] as const).map((a) => (
              <Option key={a} on={filters.availability === a} onClick={() => (set("availability", a), close())}>{AVAILABILITY_LABELS[a]}</Option>
            ))}
          </>
        )}
      </Pop>

      <button
        type="button"
        onClick={onMore}
        className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-border bg-surface px-3.5 text-[13.5px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        <IconFilter size={15} />
        More filters
        {moreCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">{moreCount}</span>}
      </button>
    </div>
  );
}
