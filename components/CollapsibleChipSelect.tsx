"use client";

import { useState } from "react";
import ChipSelect from "./ChipSelect";

export default function CollapsibleChipSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = "Tap to select",
  defaultOpen = false,
}: {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  placeholder?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const selected = options.find((o) => o.value === value);

  return (
    <section>
      <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">{label}</h3>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3.5 text-base active:bg-surface-muted"
      >
        <span className={selected ? "text-foreground font-medium" : "text-muted"}>
          {selected ? selected.label : placeholder}
        </span>
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
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="mt-3">
          <ChipSelect
            options={options}
            value={value}
            onChange={(v) => {
              onChange(v);
              setOpen(false);
            }}
          />
        </div>
      )}
    </section>
  );
}
