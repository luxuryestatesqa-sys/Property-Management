"use client";

import { useEffect, useState } from "react";
import { IconDots } from "./icons";

export interface RowMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
  // draws a divider line above this item
  separator?: boolean;
}

// A "⋯" button that opens a small action menu. The menu is positioned with
// `fixed` from the button's own rectangle, so it is never clipped by a table's
// scroll container, and closes on outside click, Esc, scroll or resize.
export default function RowMenu({ items, disabled, label = "More actions" }: { items: RowMenuItem[]; disabled?: boolean; label?: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [pos]);

  if (visible.length === 0) return null;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos(pos ? null : { x: r.right, y: r.bottom + 6 });
        }}
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 ${pos ? "bg-slate-100 text-slate-900" : ""}`}
      >
        <IconDots size={17} />
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setPos(null)} />
          <div
            role="menu"
            className="page-in fixed z-[61] w-56 -translate-x-full overflow-hidden rounded-xl bg-white py-1.5 shadow-[0_12px_32px_-8px_rgba(16,24,40,0.28),0_0_0_1px_rgba(16,24,40,0.06)]"
            style={{ left: pos.x, top: pos.y }}
          >
            {visible.map((item) => (
              <div key={item.label}>
                {item.separator && <div className="my-1.5 border-t border-slate-100" />}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPos(null);
                    item.onClick();
                  }}
                  className={`flex w-full items-center px-3.5 py-2 text-left text-[13.5px] font-medium transition-colors ${
                    item.danger ? "text-danger hover:bg-danger-bg" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
