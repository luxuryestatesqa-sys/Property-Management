"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { isAdminRole } from "@/lib/roles";
import { IconSearch, IconPlus, IconBuilding, IconList, IconChevronRight, IconUsers, IconSettings } from "./desktop/icons";

export const OPEN_PALETTE_EVENT = "open-command-palette";

const MOD = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform) ? "⌘" : "Ctrl ";

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  href: string;
  group: string;
}

// ⌘K / Ctrl+K: jump anywhere, search the inventory, or open a listing by its ID.
export default function CommandPalette() {
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const isAdmin = isAdminRole(session?.user?.role);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    }
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim();
    const list: Item[] = [];
    if (q) {
      const idMatch = q.match(/^(?:lst-?)?0*(\d{1,9})$/i);
      if (idMatch) list.push({ id: "open-id", label: `Open listing LST-${idMatch[1].padStart(6, "0")}`, icon: <IconBuilding size={16} />, href: `/property/${idMatch[1]}`, group: "Jump to" });
      list.push({ id: "search", label: `Search properties for “${q}”`, hint: "Location, building, agent…", icon: <IconSearch size={16} />, href: `/?q=${encodeURIComponent(q)}`, group: "Search" });
    }
    const nav: Item[] = [
      { id: "n-props", label: "Properties", hint: "Browse every listing", icon: <IconList size={16} />, href: "/", group: "Go to" },
      { id: "n-mine", label: "My Listings", hint: "Manage your own", icon: <IconBuilding size={16} />, href: "/my-listings", group: "Go to" },
      { id: "n-add", label: "Add Property", hint: "Create a new listing", icon: <IconPlus size={16} />, href: "/add", group: "Go to" },
      ...(isAdmin ? [{ id: "n-users", label: "Users", hint: "Team and access", icon: <IconUsers size={16} />, href: "/admin/users", group: "Go to" }] : []),
      { id: "n-set", label: "Settings", hint: "Account, branding, integrations", icon: <IconSettings size={16} />, href: "/settings", group: "Go to" },
    ];
    const filtered = q ? nav.filter((n) => n.label.toLowerCase().includes(q.toLowerCase())) : nav;
    return [...list, ...filtered];
  }, [query, isAdmin]);

  useEffect(() => setActive(0), [query]);

  function go(item: Item | undefined) {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  }

  if (!open) return null;

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center px-4 pt-[14vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[3px]" onClick={() => setOpen(false)} />
      <div className="page-in relative w-full max-w-[600px] overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_-12px_rgba(16,24,40,0.45),0_0_0_1px_rgba(16,24,40,0.06)]">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <IconSearch size={18} className="text-slate-400" />
          <input
            ref={inputRef}
            data-bare
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") go(items[active]);
            }}
            placeholder="Search properties, jump to a page, or type a listing ID…"
            className="min-w-0 flex-1 bg-transparent py-4 text-[15px] outline-none"
          />
          <kbd className="rounded-md border border-border bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">esc</kbd>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-2">
          {items.length === 0 && <div className="px-4 py-8 text-center text-[14px] text-muted">Nothing matches “{query}”.</div>}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {header && <div className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">{header}</div>}
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${i === active ? "bg-accent-light" : ""}`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${i === active ? "bg-white text-primary shadow-sm" : "bg-slate-100 text-slate-500"}`}>{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{item.label}</span>
                    {item.hint && <span className="block truncate text-[12px] text-muted">{item.hint}</span>}
                  </span>
                  {i === active && <IconChevronRight size={15} className="text-slate-400" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-border bg-slate-50 px-4 py-2.5 text-[11.5px] text-slate-500">
          <span>
            <kbd className="font-sans font-semibold">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="font-sans font-semibold">↵</kbd> open
          </span>
          <span className="ml-auto">
            <kbd className="font-sans font-semibold">{MOD}K</kbd> toggle
          </span>
        </div>
      </div>
    </div>
  );
}
