"use client";

interface Option<T extends string> {
  label: string;
  value: T;
  count?: number | null;
}

// Segmented switch with live result counts, e.g. "All 40 · For Rent 31 · For Sale 9".
export default function SegmentedCounts<T extends string>({ options, value, onChange }: { options: Option<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex h-full items-stretch gap-1 rounded-xl bg-slate-200/70 p-1" role="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-[13.5px] font-medium transition-all duration-200 ${
              on ? "bg-white text-foreground shadow-[0_1px_2px_rgba(16,24,40,.1),0_0_0_1px_rgba(16,24,40,.04)]" : "text-slate-500 hover:text-foreground"
            }`}
          >
            {o.label}
            {o.count !== undefined && o.count !== null && (
              <span className={`tnum rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${on ? "bg-slate-100 text-slate-700" : "bg-white/70 text-slate-500"}`}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
