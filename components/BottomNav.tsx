"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const icons = {
  properties: (active: boolean) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--primary)" : "#8a93a3"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  ),
  listings: (active: boolean) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--primary)" : "#8a93a3"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h4" />
    </svg>
  ),
  users: (active: boolean) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--primary)" : "#8a93a3"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3.3 3-5.5 7-5.5s7 2.2 7 5.5" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M17 14.2c2.8.4 5 2.4 5 5.3" />
    </svg>
  ),
  profile: (active: boolean) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--primary)" : "#8a93a3"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  ),
};

function NavItem({ href, label, icon, active }: { href: string; label: string; icon: (active: boolean) => React.ReactNode; active: boolean }) {
  return (
    <Link href={href} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 active:bg-surface-muted">
      {icon(active)}
      <span className="text-[11px] font-medium" style={{ color: active ? "var(--primary)" : "#8a93a3" }}>
        {label}
      </span>
    </Link>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const addActive = pathname.startsWith("/add");

  const leftItems = [
    { href: "/", label: "Properties", icon: icons.properties },
    { href: "/my-listings", label: "My Listings", icon: icons.listings },
  ];
  const rightItems = [
    ...(isAdmin ? [{ href: "/admin/users", label: "Users", icon: icons.users }] : []),
    { href: "/profile", label: "Profile", icon: icons.profile },
  ];

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border safe-bottom overflow-visible">
      <div className="relative mx-auto max-w-md grid items-stretch" style={{ gridTemplateColumns: "1fr 64px 1fr" }}>
        <div className="flex">
          {leftItems.map((item) => (
            <NavItem key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </div>
        {/* Fixed-width center column reserves room for the raised Add button below,
            always centered regardless of how many items are on each side. */}
        <div aria-hidden="true" />
        <div className="flex">
          {rightItems.map((item) => (
            <NavItem key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </div>

        <Link
          href="/add"
          aria-label="Add property"
          className="absolute left-1/2 -translate-x-1/2 -top-6 flex flex-col items-center gap-1 active:opacity-80"
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-4 border-background"
            style={{ background: "var(--primary)" }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <span className="text-[11px] font-medium" style={{ color: addActive ? "var(--primary)" : "#8a93a3" }}>
            Add
          </span>
        </Link>
      </div>
    </nav>
  );
}
