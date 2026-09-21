"use client";

function PhoneIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.24 1.01l-2.21 2.2z" />
    </svg>
  );
}

interface CallButtonProps {
  number: string;
  label?: string; // overrides the "full" variant's visible button text (default "Call")
  variant?: "icon" | "full";
  size?: number;
  className?: string;
}

export default function CallButton({ number, label = "Call", variant = "icon", size = 32, className = "" }: CallButtonProps) {
  const href = `tel:${number.replace(/[^\d+]/g, "")}`;

  if (variant === "full") {
    return (
      <a
        href={href}
        onClick={(e) => e.stopPropagation()}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold active:opacity-70 ${className}`}
        style={{ background: "var(--accent-light)", color: "var(--primary)" }}
      >
        <PhoneIcon size={15} />
        {label}
      </a>
    );
  }

  return (
    <a
      href={href}
      onClick={(e) => e.stopPropagation()}
      aria-label="Call"
      className={`rounded-full flex items-center justify-center shrink-0 active:opacity-70 ${className}`}
      style={{ background: "var(--accent-light)", color: "var(--primary)", width: size, height: size }}
    >
      <PhoneIcon size={Math.round(size * 0.5)} />
    </a>
  );
}
