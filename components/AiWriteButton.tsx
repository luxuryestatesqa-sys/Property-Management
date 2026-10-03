"use client";

interface AiWriteButtonProps {
  onClick: () => void;
  busy: boolean;
  disabled?: boolean;
  label?: string;
}

// The small "write this field with AI" chip that sits at the top-right of a
// Title or Description box - one per field, so an agent can have just the one
// they want written.
export default function AiWriteButton({ onClick, busy, disabled, label = "Write with AI" }: AiWriteButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold active:opacity-70 disabled:opacity-50"
      style={{ background: "var(--accent-light)", color: "var(--primary)" }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2zm7 11l.9 2.6 2.6.9-2.6.9L19 20l-.9-2.6-2.6-.9 2.6-.9L19 13zM5 14l.7 2 2 .7-2 .7L5 19.4l-.7-2-2-.7 2-.7L5 14z" />
      </svg>
      {busy ? "Writing..." : label}
    </button>
  );
}
