"use client";

export default function ChipSelect<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="text-[13px] font-medium px-3.5 py-2.5 rounded-xl"
          style={
            value === opt.value
              ? { background: "var(--primary)", color: "#fff" }
              : { background: "var(--surface-muted)", color: "var(--foreground)" }
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
