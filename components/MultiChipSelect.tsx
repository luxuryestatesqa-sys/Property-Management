"use client";

// Same visual language as ChipSelect, but toggles multiple values on/off
// instead of picking exactly one - used for amenities, where a listing can
// have any number of them.
export default function MultiChipSelect({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className="text-[13px] font-medium px-3.5 py-2.5 rounded-xl"
            style={active ? { background: "var(--primary)", color: "#fff" } : { background: "var(--surface-muted)", color: "var(--foreground)" }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
