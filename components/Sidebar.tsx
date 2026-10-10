"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import Avatar from "./Avatar";
import { useOrg } from "./OrgProvider";
import { isAdminRole, ROLE_LABELS } from "@/lib/roles";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const icons = {
  properties: (
    <svg width="19" height="19" viewBox="0 0 24 24" {...stroke}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  ),
  listings: (
    <svg width="19" height="19" viewBox="0 0 24 24" {...stroke}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h4" />
    </svg>
  ),
  users: (
    <svg width="19" height="19" viewBox="0 0 24 24" {...stroke}>
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3.3 3-5.5 7-5.5s7 2.2 7 5.5" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M17 14.2c2.8.4 5 2.4 5 5.3" />
    </svg>
  ),
  settings: (
    <svg width="19" height="19" viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  ),
  logout: (
    <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </svg>
  ),
};

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: React.ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={label}
      className="group relative flex items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors hover:bg-white/5 xl:justify-start"
      style={{
        color: active ? "#f1d9a4" : "#a3a9b5",
        background: active ? "rgba(201,161,90,.14)" : undefined,
      }}
    >
      {active && <span className="absolute -left-3 top-2 bottom-2 w-[3px] xl:-left-4 rounded-r-full" style={{ background: "var(--accent)" }} />}
      <span className="transition-colors group-hover:text-white">{icon}</span>
      <span className="hidden transition-colors group-hover:text-white xl:inline">{label}</span>
    </Link>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-3 mb-2 mt-5 border-t border-white/10 xl:hidden" />
      <div className="hidden px-3 pb-1.5 pt-6 text-[10.5px] font-semibold uppercase tracking-[0.14em] xl:block" style={{ color: "#5d6370" }}>
        {children}
      </div>
    </>
  );
}

// Desktop-only (lg+) left navigation. Phones keep the BottomNav; this shows
// the same destinations, plus the signed-in agent and sign-out at the bottom.
export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const org = useOrg();
  const isAdmin = isAdminRole(session?.user?.role);
  const onProperties = pathname === "/" || pathname.startsWith("/property") || pathname.startsWith("/add");

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[76px] flex-col lg:flex xl:w-64" style={{ background: "linear-gradient(180deg,#14181f 0%,#101319 100%)" }}>
      <div className="px-5 pb-5 pt-7 max-xl:px-0 max-xl:flex max-xl:justify-center">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={org.logoUrl ?? "/icon.png"} alt="" className={`h-10 w-10 rounded-xl ring-1 ring-white/10 ${org.logoUrl ? "bg-white object-contain p-1" : "p-1.5"}`} style={org.logoUrl ? undefined : { background: "var(--primary)" }} />
          <div className="hidden leading-tight xl:block">
            <div className="max-w-[150px] truncate text-[15px] font-semibold text-white">{org.name}</div>
            <div className="text-[12px]" style={{ color: "#7d8492" }}>
              Listings Portal
            </div>
          </div>
        </Link>
      </div>

      <div className="px-4 max-xl:px-3">
        <Link
          href="/add"
          title="Add Property"
          className="flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold text-[#14181f] shadow-lg shadow-black/20 transition-all hover:brightness-110"
          style={{ background: "linear-gradient(135deg,#e3c283,#c9a15a)" }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="hidden xl:inline">Add Property</span>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-4 pt-2 max-xl:px-3">
        <Section>Workspace</Section>
        <NavLink href="/" label="Properties" icon={icons.properties} active={onProperties} />
        <NavLink href="/my-listings" label="My Listings" icon={icons.listings} active={pathname.startsWith("/my-listings")} />
        {isAdmin && (
          <>
            <Section>Administration</Section>
            <NavLink href="/admin/users" label="Users" icon={icons.users} active={pathname.startsWith("/admin/users")} />
          </>
        )}
        <Section>Account</Section>
        <NavLink href="/profile" label="Settings" icon={icons.settings} active={pathname.startsWith("/profile")} />
      </nav>

      {session?.user && (
        <div className="m-3 flex flex-col items-center gap-3 rounded-xl p-3 xl:flex-row" style={{ background: "rgba(255,255,255,.05)" }}>
          <Avatar name={session.user.name ?? "?"} size={36} />
          <div className="hidden min-w-0 flex-1 leading-tight xl:block">
            <div className="truncate text-[13px] font-semibold text-white">{session.user.name}</div>
            <div className="text-[11.5px]" style={{ color: "#7d8492" }}>
              {session.user.role ? ROLE_LABELS[session.user.role] : "Agent"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            aria-label="Log out"
            title="Log out"
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10 hover:text-white"
            style={{ color: "#8d93a0" }}
          >
            {icons.logout}
          </button>
        </div>
      )}
    </aside>
  );
}
