"use client";

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex bg-surface-muted rounded-xl p-1 gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 text-[13px] font-medium py-2.5 rounded-lg transition-colors ${
            value === opt.value ? "bg-surface text-foreground shadow-sm" : "text-muted"
          }`}
          style={value === opt.value ? { color: "var(--primary)" } : undefined}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
