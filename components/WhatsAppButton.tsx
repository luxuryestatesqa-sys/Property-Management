"use client";

function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.64-1.03-5.13-2.9-7-1.87-1.87-4.36-2.9-7-2.92zm0 18.1h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.14.82.84-3.06-.2-.31a8.2 8.2 0 0 1-1.26-4.4c0-4.54 3.7-8.24 8.26-8.24 2.2 0 4.28.86 5.84 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.55-3.7 8.27-8.25 8.27zm4.52-6.19c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.13-.16.24-.64.81-.78.97-.14.17-.29.19-.53.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.23-1.46-1.37-1.7-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.36-.77-1.86-.2-.48-.41-.42-.56-.43h-.48c-.16 0-.43.06-.66.31-.22.24-.87.85-.87 2.08 0 1.22.89 2.4 1.02 2.57.12.16 1.75 2.68 4.25 3.75.59.26 1.05.41 1.41.53.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.16-.47-.28z" />
    </svg>
  );
}

function buildWhatsAppUrl(number: string, message?: string): string {
  const digits = number.replace(/[^\d+]/g, "").replace(/^\+/, "");
  const params = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${params}`;
}

interface WhatsAppButtonProps {
  number: string;
  name?: string;
  message?: string; // overrides the default "reaching out about a listing" text
  label?: string; // overrides the "full" variant's visible button text (default "WhatsApp")
  variant?: "icon" | "full";
  size?: number;
  className?: string;
}

export default function WhatsAppButton({ number, name, message, label = "WhatsApp", variant = "icon", size = 32, className = "" }: WhatsAppButtonProps) {
  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const text = message ?? (name ? `Hi ${name}, I'm reaching out about a property listing on Luxury Estates.` : undefined);
    window.open(buildWhatsAppUrl(number, text), "_blank", "noopener,noreferrer");
  }

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold active:opacity-70 ${className}`}
        style={{ background: "#e7f9ee", color: "#1a7f3c" }}
      >
        <WhatsAppIcon size={15} />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={name ? `Contact ${name} on WhatsApp` : "Contact on WhatsApp"}
      className={`rounded-full flex items-center justify-center shrink-0 active:opacity-70 ${className}`}
      style={{ background: "#e7f9ee", color: "#1a7f3c", width: size, height: size }}
    >
      <WhatsAppIcon size={Math.round(size * 0.5)} />
    </button>
  );
}
