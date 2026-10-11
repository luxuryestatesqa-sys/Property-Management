"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import Avatar from "./Avatar";
import { useEffect, useState } from "react";
import { useOrg } from "./OrgProvider";
import { isAdminRole, isManagerRole, ROLE_LABELS } from "@/lib/roles";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const icons = {
  properties: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  ),
  listings: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h4" />
    </svg>
  ),
  users: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3.3 3-5.5 7-5.5s7 2.2 7 5.5" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M17 14.2c2.8.4 5 2.4 5 5.3" />
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  ),
  leads: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </svg>
  ),
  logout: (
    <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </svg>
  ),
};

function NavLink({ href, label, icon, active, badge, children }: { href: string; label: string; icon: React.ReactNode; active: boolean; badge?: number; children?: React.ReactNode }) {
  return (
    <div>
      <Link
        href={href}
        title={label}
        aria-current={active ? "page" : undefined}
        className={`group relative flex h-10 items-center justify-center gap-3 rounded-xl px-3 text-[14px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary/40 xl:justify-start ${
          active ? "bg-accent-light font-medium text-primary" : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
        }`}
      >
        {active && <span className="absolute -left-4 top-2 bottom-2 w-[3px] rounded-r-full bg-primary max-xl:-left-3" />}
        <span className={`relative shrink-0 transition-colors ${active ? "text-primary" : "text-slate-400 group-hover:text-slate-700"}`}>
          {icon}
          {badge ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white xl:hidden" /> : null}
        </span>
        <span className="hidden xl:inline">{label}</span>
        {badge ? <span className="tnum ml-auto hidden rounded-full bg-rose-500 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-white xl:inline">{badge > 99 ? "99+" : badge}</span> : null}
      </Link>
      {children}
    </div>
  );
}

// The pages under Leads. They show only while you are inside Leads, and only on the wide sidebar.
function SubNav({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <ul className="ml-[21px] mt-1 hidden flex-col gap-0.5 border-l border-slate-200 pl-3 xl:flex" aria-label="Leads pages">
      {items.map((i) => (
        <li key={i.href}>
          <Link href={i.href} aria-current={i.active ? "page" : undefined} className={`block rounded-lg px-3 py-1.5 text-[13px] transition-colors ${i.active ? "bg-slate-100 font-medium text-slate-900" : "text-slate-500 hover:bg-slate-100/70 hover:text-slate-800"}`}>
            {i.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-3 my-3 border-t border-slate-200/80 xl:hidden" />
      <div className="hidden px-3 pb-1.5 pt-5 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400 xl:block">{children}</div>
    </>
  );
}

// Desktop-only (lg+) left navigation. Phones keep the BottomNav.
// Deliberately NOT themed by the agency's brand colour: the sidebar is one
// fixed, neutral design (white, grey hover) for every agency. The only things
// an agency changes here are its name and logo.
export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const org = useOrg();
  const isAdmin = isAdminRole(session?.user?.role);
  const isManager = isManagerRole(session?.user?.role);
  const [newLeads, setNewLeads] = useState(0);
  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    const load = () =>
      fetch("/api/leads/summary")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => !cancelled && d && setNewLeads((d.newCount ?? 0) + (d.overdueCount ?? 0)))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [session?.user, pathname]);
  const onProperties = pathname === "/" || pathname.startsWith("/property") || pathname.startsWith("/add");
  const onLeads = pathname.startsWith("/leads");
  const leadPages = [
    { href: "/leads", label: "All leads", active: pathname === "/leads" || /^\/leads\/(?!assignment|rules|stages)/.test(pathname) },
    ...(isManager ? [{ href: "/leads/assignment", label: "Assignment", active: pathname.startsWith("/leads/assignment") }, { href: "/leads/rules", label: "Assignment rules", active: pathname.startsWith("/leads/rules") }] : []),
    ...(isAdmin ? [{ href: "/leads/stages", label: "Stages", active: pathname.startsWith("/leads/stages") }] : []),
  ];
  const initial = org.name.trim().charAt(0).toUpperCase() || "•";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[76px] flex-col border-r border-slate-200/80 bg-white lg:flex xl:w-64">
      <div className="flex justify-center px-5 pb-5 pt-6 xl:block">
        <Link href="/" className="flex items-center gap-3">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1" />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-[18px] font-semibold text-white shadow-sm">{initial}</span>
          )}
          <div className="hidden leading-tight xl:block">
            <div className="max-w-[150px] truncate text-[15.5px] font-medium tracking-tight text-slate-900">{org.name}</div>
            <div className="mt-0.5 text-[12px] text-slate-500">Real Estate CRM</div>
          </div>
        </Link>
      </div>

      <div className="px-4 max-xl:px-3">
        <Link
          href="/add"
          title="Add Property"
          className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-primary text-[14px] font-medium text-white shadow-[0_1px_2px_rgba(30,27,75,0.3),0_8px_18px_-8px_rgba(79,70,229,0.7)] transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="hidden xl:inline">Add Property</span>
        </Link>
      </div>

      <nav className="no-scrollbar flex flex-1 flex-col gap-0.5 overflow-y-auto px-4 pb-2 pt-1 max-xl:px-3">
        <Section>Listings</Section>
        <NavLink href="/" label="Properties" icon={icons.properties} active={onProperties} />
        <NavLink href="/my-listings" label="My Listings" icon={icons.listings} active={pathname.startsWith("/my-listings")} />
        <Section>Leads</Section>
        <NavLink href="/leads" label="Leads" icon={icons.leads} active={onLeads} badge={newLeads}>
          {onLeads && leadPages.length > 1 && <SubNav items={leadPages} />}
        </NavLink>
        {isAdmin && (
          <>
            <Section>Team</Section>
            <NavLink href="/admin/users" label="Users" icon={icons.users} active={pathname.startsWith("/admin/users")} />
          </>
        )}
      </nav>

      <div className="px-4 pb-1 max-xl:px-3">
        <NavLink href="/profile" label="Settings" icon={icons.settings} active={pathname.startsWith("/profile")} />
      </div>

      {session?.user && (
        <div className="m-3 mt-2 flex flex-col items-center gap-3 rounded-2xl bg-slate-50 p-3 xl:flex-row">
          <Avatar name={session.user.name ?? "?"} size={36} neutral />
          <div className="hidden min-w-0 flex-1 leading-tight xl:block">
            <div className="truncate text-[13px] font-medium text-slate-900">{session.user.name}</div>
            <div className="mt-0.5 text-[11.5px] text-slate-500">{session.user.role ? ROLE_LABELS[session.user.role] : "Agent"}</div>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            aria-label="Log out"
            title="Log out"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700"
          >
            {icons.logout}
          </button>
        </div>
      )}
    </aside>
  );
}
