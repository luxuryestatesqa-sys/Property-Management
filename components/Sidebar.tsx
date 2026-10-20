"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import Avatar from "./Avatar";
import { useLeadBadge } from "@/lib/useLeadBadge";
import { useOrg } from "./OrgProvider";
import { ROLE_LABELS } from "@/lib/roles";
import { can } from "@/lib/permissions";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const icons = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
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
          active ? "bg-accent-light font-medium text-primary" : "text-slate-500 hover:bg-white/70 hover:text-primary-dark"
        }`}
      >
        {active && <span className="absolute -left-4 top-2 bottom-2 w-[3px] rounded-r-full bg-primary max-xl:-left-3" />}
        <span className={`relative shrink-0 transition-colors ${active ? "text-primary" : "text-slate-500 group-hover:text-primary-dark"}`}>
          {icon}
          {badge ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-white xl:hidden" /> : null}
        </span>
        <span className="hidden xl:inline">{label}</span>
        {badge ? <span className="tnum ml-auto hidden rounded-full bg-primary px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-white xl:inline">{badge > 99 ? "99+" : badge}</span> : null}
      </Link>
      {children}
    </div>
  );
}

// The pages under Leads. They show only while you are inside Leads, and only on the wide sidebar.
function SubNav({ items, label = "Leads pages" }: { items: { href: string; label: string; active: boolean }[]; label?: string }) {
  return (
    <ul className="ml-[21px] mt-1 hidden flex-col gap-0.5 border-l border-slate-200 pl-3 xl:flex" aria-label={label}>
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
      <div className="mx-3 my-2 border-t border-slate-200/80 xl:hidden" />
      <div className="hidden px-3 pb-1.5 pt-5 label-caps xl:block">{children}</div>
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
  const canUsers = can(session?.user, "users.manage");
  const canDashboard = can(session?.user, "dashboard.view");
  const canAssign = can(session?.user, "leads.assign");
  const canStages = can(session?.user, "leads.stages");
  const newLeads = useLeadBadge(!!session?.user, pathname);
  const onAdd = pathname.startsWith("/add");
  const onProperties = pathname === "/" || pathname.startsWith("/property");
  const onLeads = pathname.startsWith("/leads");
  const leadPages = [
    { href: "/leads", label: "All leads", active: pathname === "/leads" || /^\/leads\/(?!assignment|rules|stages)/.test(pathname) },
    ...(canAssign ? [{ href: "/leads/assignment", label: "Assignment", active: pathname.startsWith("/leads/assignment") }, { href: "/leads/rules", label: "Assignment rules", active: pathname.startsWith("/leads/rules") }] : []),
    ...(canStages ? [{ href: "/leads/stages", label: "Stages", active: pathname.startsWith("/leads/stages") }] : []),
  ];
  const initial = org.name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join("").toUpperCase() || "•";

  return (
    <aside className="no-scrollbar fixed inset-y-0 left-0 z-40 hidden w-[76px] flex-col overflow-y-auto glass border-r border-white/60 lg:flex xl:w-64">
      <div className="flex shrink-0 justify-center px-5 pb-5 pt-6 max-xl:pb-3 max-xl:pt-4 xl:block">
        <Link href="/" className="flex items-center gap-3">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-1 shadow-[0_4px_14px_rgba(13,31,92,0.1)]" />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-[15px] font-semibold tracking-tight text-white shadow-[0_4px_14px_rgba(13,31,92,0.18)]">{initial}</span>
          )}
          <div className="hidden leading-tight xl:block">
            <div className="max-w-[150px] truncate text-[15.5px] font-medium tracking-tight text-slate-900">{org.name}</div>
            <div className="mt-0.5 text-[12px] text-slate-500">Real Estate CRM</div>
          </div>
        </Link>
      </div>

      <div className="shrink-0 px-4 max-xl:px-3">
        <Link
          href="/add"
          title="Add Property"
          aria-current={onAdd ? "page" : undefined}
          className={`flex h-10 items-center justify-center gap-2 rounded-xl ${onAdd ? "bg-primary text-white" : "bg-primary-soft text-primary hover:bg-indigo-100"} text-[14px] font-semibold transition-colors duration-200 active:scale-[0.98]`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="hidden xl:inline">Add Property</span>
        </Link>
      </div>

      <nav className="flex shrink-0 flex-1 flex-col gap-0.5 px-4 pb-2 pt-1 max-xl:px-3">
        {canDashboard ? (
          <>
            <Section>Overview</Section>
            <NavLink href="/dashboard" label="Dashboard" icon={icons.dashboard} active={pathname.startsWith("/dashboard")}>
              {(
                <SubNav
                  label="Dashboard pages"
                  items={[
                    { href: "/dashboard", label: "Overview", active: pathname === "/dashboard" },
                    { href: "/dashboard/activities", label: "Activities", active: pathname.startsWith("/dashboard/activities") },
                  ]}
                />
              )}
            </NavLink>
          </>
        ) : (
          <>
            <Section>Overview</Section>
            <NavLink href="/dashboard/activities" label="Activities" icon={icons.dashboard} active={pathname.startsWith("/dashboard/activities")} />
          </>
        )}
        <Section>Listings</Section>
        <NavLink href="/" label="Properties" icon={icons.properties} active={onProperties} />
        <NavLink href="/my-listings" label="My Listings" icon={icons.listings} active={pathname.startsWith("/my-listings")} />
        <Section>Leads</Section>
        <NavLink href="/leads" label="Leads" icon={icons.leads} active={onLeads} badge={newLeads}>
          {onLeads && leadPages.length > 1 && <SubNav items={leadPages} />}
        </NavLink>
        {canUsers && (
          <>
            <Section>Team</Section>
            <NavLink href="/admin/users" label="Users" icon={icons.users} active={pathname.startsWith("/admin/users")} />
          </>
        )}
      </nav>

      <div className="shrink-0 px-4 pb-1 max-xl:px-3">
        <NavLink href="/settings" label="Settings" icon={icons.settings} active={pathname.startsWith("/settings")} />
      </div>

      {session?.user && (
        <div className="m-3 mt-2 flex shrink-0 flex-col items-center gap-2 rounded-2xl bg-white/60 p-2 xl:flex-row xl:gap-3 xl:p-3">
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
