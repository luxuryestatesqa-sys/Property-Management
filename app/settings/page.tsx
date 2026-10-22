"use client";

import { can } from "@/lib/permissions";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { UserDTO } from "@/lib/types";
import { resizeImageFile } from "@/lib/image";
import { extractErrorMessage } from "@/lib/errors";
import Avatar from "@/components/Avatar";
import ProfileSkeleton from "@/components/ProfileSkeleton";
import PropertyFinderSettingsCard from "@/components/PropertyFinderSettingsCard";
import MetaLeadsSettingsCard from "@/components/MetaLeadsSettingsCard";
import PortalFeedCard from "@/components/PortalFeedCard";
import MasterFeedCard from "@/components/MasterFeedCard";
import OpenAiSettingsCard from "@/components/OpenAiSettingsCard";
import QatarLivingApiCard from "@/components/QatarLivingApiCard";
import AgencyBrandingCard from "@/components/AgencyBrandingCard";
import { ROLE_LABELS } from "@/lib/roles";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { IconUsers, IconBuilding, IconGlobe, IconLock, IconSettings } from "@/components/desktop/icons";

const MAX_AVATAR_SOURCE_BYTES = 10 * 1024 * 1024; // 10MB raw upload cap, before client-side resize

type SettingsTab = "profile" | "security" | "agency" | "integrations" | "lead-sources" | "ai";

const inputCls = "w-full rounded-xl border border-border bg-surface px-4 py-3 text-[15px] outline-none";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-4 px-7 py-4">
      <div className="text-[13.5px] text-muted">{label}</div>
      <div className="min-w-0 text-[14.5px] font-medium">{children}</div>
    </div>
  );
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const isDesktop = useIsDesktop();
  const [tab, setTab] = useState<SettingsTab>("profile");
  const [profile, setProfile] = useState<UserDTO | null>(null);
  // Phone: which settings screen is open (null = the menu). The phone's back button returns to the menu.
  const [section, setSection] = useState<SettingsTab | null>(null);
  // Coming back from Facebook lands on ?tab=lead-sources.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "lead-sources" || t === "integrations" || t === "agency" || t === "security" || t === "ai") {
      setTab(t);
      setSection(t);
    }
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const onPop = () => setSection(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  function openSection(key: SettingsTab) {
    window.history.pushState({ settings: key }, "");
    setSection(key);
    window.scrollTo({ top: 0 });
  }
  function closeSection() {
    if (window.history.state?.settings) window.history.back();
    else setSection(null);
  }
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [editingWhatsapp, setEditingWhatsapp] = useState(false);
  const [whatsappInput, setWhatsappInput] = useState("");
  const [whatsappError, setWhatsappError] = useState("");
  const [whatsappSaving, setWhatsappSaving] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadProfile() {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        setProfile(d.user);
        setWhatsappInput(d.user?.whatsapp ?? "");
      })
      .catch(() => setProfile(null))
      .finally(() => setLoadingProfile(false));
  }

  useEffect(() => {
    loadProfile();
  }, []);

  if (!session || loadingProfile) return <ProfileSkeleton />;
  const user = session.user;
  const canAgency = can(user, "settings.agency");
  const canIntegrations = can(user, "settings.integrations");
  const canUsers = can(user, "users.manage");
  const isAdmin = canAgency || canIntegrations || canUsers;
  const sectionAllowed = (key: string | null) => key === "profile" || key === "security" || (key === "agency" ? canAgency : key === "integrations" || key === "lead-sources" || key === "ai" ? canIntegrations : false);

  async function handleAvatarSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file");
      return;
    }
    if (file.size > MAX_AVATAR_SOURCE_BYTES) {
      setAvatarError("Image is too large (max 10MB)");
      return;
    }

    setAvatarError("");
    setAvatarUploading(true);
    try {
      const dataUrl = await resizeImageFile(file);
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAvatarError(extractErrorMessage(data.error, "Failed to update photo"));
        return;
      }
      setProfile(data.user);
    } catch {
      setAvatarError("Failed to process image");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/me/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to change password");
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setChangingPassword(false);
        setSuccess(false);
      }, 1200);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitWhatsappChange(e: React.FormEvent) {
    e.preventDefault();
    setWhatsappError("");
    setWhatsappSaving(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp: whatsappInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWhatsappError(extractErrorMessage(data.error, "Enter a valid WhatsApp number"));
        return;
      }
      setProfile(data.user);
      setEditingWhatsapp(false);
    } finally {
      setWhatsappSaving(false);
    }
  }

  if (isDesktop) {
    const nav: { key: SettingsTab; label: string; hint: string; icon: React.ReactNode; admin?: "agency" | "integrations" }[] = [
      { key: "profile", label: "Profile", hint: "Your details and photo", icon: <IconUsers size={18} /> },
      { key: "security", label: "Security", hint: "Password and sign out", icon: <IconLock size={18} /> },
      { key: "agency", label: "Agency", hint: "Name and logo", icon: <IconBuilding size={18} />, admin: "agency" },
      { key: "integrations", label: "Portals & feeds", hint: "Property Finder and more", icon: <IconGlobe size={18} />, admin: "integrations" },
      { key: "lead-sources", label: "Lead sources", hint: "Facebook & Instagram ads", icon: <IconUsers size={18} />, admin: "integrations" },
      { key: "ai", label: "AI writing", hint: "OpenAI key", icon: <IconSettings size={18} />, admin: "integrations" },
    ];
    const visible = nav.filter((n) => !n.admin || (n.admin === "agency" ? canAgency : canIntegrations));
    const roleLabel = ROLE_LABELS[user.role];

    return (
      <div className="page-in">
        <div className="pb-7 pt-10">
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">Settings</h1>
          <p className="mt-2.5 text-[15px] text-muted">Manage your account{isAdmin ? ", your agency and its integrations" : ""}.</p>
        </div>

        <div className="grid grid-cols-[250px_minmax(0,1fr)] items-start gap-8">
          <nav className="surface-card sticky top-6 flex flex-col gap-1 p-2.5" aria-label="Settings sections">
            {visible.map((n, i) => {
              const active = tab === n.key;
              return (
                <div key={n.key}>
                  {n.admin && !visible[i - 1]?.admin && <div className="mx-3 mb-1.5 mt-3 border-t border-slate-100 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">Agency settings</div>}
                  <button
                    type="button"
                    onClick={() => setTab(n.key)}
                    aria-current={active ? "page" : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${active ? "bg-accent-light text-primary" : "text-slate-600 hover:bg-slate-100"}`}
                  >
                    <span className={active ? "text-primary" : "text-slate-400"}>{n.icon}</span>
                    <span className="min-w-0">
                      <span className={`block text-[14px] ${active ? "font-semibold" : "font-medium"}`}>{n.label}</span>
                      <span className="block truncate text-[11.5px] font-normal text-slate-400">{n.hint}</span>
                    </span>
                  </button>
                </div>
              );
            })}
          </nav>

          <div key={tab} className="page-in flex min-w-0 flex-col gap-6">
            {tab === "profile" && (
              <>
                <div className="surface-card relative overflow-hidden">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-indigo-50/80 to-transparent" />
                  <div className="relative flex flex-wrap items-center gap-x-6 gap-y-4 px-7 py-7">
                    <div className="relative shrink-0">
                      <div className="rounded-full ring-4 ring-white shadow-sm">
                        <Avatar name={user.name ?? "?"} avatarUrl={profile?.avatarUrl} size={88} className="text-3xl" />
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={avatarUploading}
                        aria-label="Change profile photo"
                        title="Change photo"
                        className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-800 text-white shadow transition-colors hover:bg-slate-700 disabled:opacity-60"
                      >
                        {avatarUploading ? (
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--surface-elevated)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                        )}
                      </button>
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarSelected} className="hidden" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <h2 className="truncate text-[24px] font-medium tracking-[-0.02em]">{user.name}</h2>
                        <span className="rounded-full bg-accent-light px-2.5 py-1 text-[11.5px] font-medium text-primary">{roleLabel}</span>
                      </div>
                      <p className="mt-1 truncate text-[14.5px] text-muted">{user.email}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-3 py-1 text-[12px] font-medium" style={{ color: "var(--success)" }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} />
                          {user.status === "ACTIVE" ? "Active account" : "Inactive"}
                        </span>
                        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={avatarUploading} className="rounded-full px-3 py-1 text-[12px] font-medium text-slate-600 ring-1 ring-border transition-colors hover:bg-surface-muted disabled:opacity-60">
                          Change photo
                        </button>
                      </div>
                    </div>
                  </div>
                  {avatarError && <div className="relative mx-7 mb-6 -mt-2 rounded-xl bg-danger-bg px-3 py-2 text-[12.5px] text-danger">{avatarError}</div>}
                </div>

                <div className="surface-card divide-y divide-slate-100 py-1">
                  <div className="px-7 pb-3 pt-5">
                    <h3 className="text-[16px] font-semibold tracking-[-0.01em]">Personal information</h3>
                    <p className="mt-0.5 text-[13px] text-muted">Agents see your WhatsApp number to contact you about listings.</p>
                  </div>
                  <Row label="Full name">{user.name}</Row>
                  <Row label="Email">{user.email}</Row>
                  <Row label="WhatsApp number">
                    {!editingWhatsapp ? (
                      <div className="flex items-center gap-3">
                        <span>{profile?.whatsapp ?? "—"}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setWhatsappInput(profile?.whatsapp ?? "");
                            setWhatsappError("");
                            setEditingWhatsapp(true);
                          }}
                          className="rounded-lg px-2.5 py-1 text-[12.5px] font-semibold text-primary hover:bg-accent-light"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={submitWhatsappChange} className="flex flex-col gap-2.5">
                        <input type="tel" required value={whatsappInput} onChange={(e) => setWhatsappInput(e.target.value)} placeholder="e.g. +974 5000 0000" className={inputCls} />
                        {whatsappError && <div className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger">{whatsappError}</div>}
                        <div className="flex gap-2">
                          <button type="submit" disabled={whatsappSaving} className="rounded-xl px-5 py-2 text-[13.5px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--primary)" }}>
                            {whatsappSaving ? "Saving..." : "Save"}
                          </button>
                          <button type="button" onClick={() => setEditingWhatsapp(false)} className="rounded-xl bg-surface-muted px-5 py-2 text-[13.5px] font-semibold hover:bg-border">
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </Row>
                  <Row label="Account status">
                    <span style={{ color: user.status === "ACTIVE" ? "var(--success)" : "var(--danger)" }}>{user.status === "ACTIVE" ? "Active" : "Inactive"}</span>
                  </Row>
                </div>
              </>
            )}

            {tab === "security" && (
              <>
                <div className="surface-card p-7">
                  <h3 className="text-[16px] font-semibold tracking-[-0.01em]">Password</h3>
                  <p className="mt-0.5 text-[13px] text-muted">Use at least 8 characters. You will stay signed in on this device.</p>
                  {!changingPassword ? (
                    <button type="button" onClick={() => setChangingPassword(true)} className="mt-5 rounded-xl bg-surface-muted px-5 py-2.5 text-[14px] font-semibold hover:bg-border">
                      Change password
                    </button>
                  ) : (
                    <form onSubmit={submitPasswordChange} className="mt-5 flex max-w-md flex-col gap-4">
                      <div>
                        <label className="mb-1.5 block text-[13.5px] font-semibold text-slate-700">Current password</label>
                        <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[13.5px] font-semibold text-slate-700">New password</label>
                        <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[13.5px] font-semibold text-slate-700">Confirm new password</label>
                        <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} />
                      </div>
                      {error && <div className="rounded-xl bg-danger-bg px-4 py-3 text-[13.5px] text-danger">{error}</div>}
                      {success && <div className="rounded-xl bg-success-bg px-4 py-3 text-[13.5px]" style={{ color: "var(--success)" }}>Password updated.</div>}
                      <div className="flex gap-2.5">
                        <button type="submit" disabled={submitting} className="rounded-xl px-6 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--primary)" }}>
                          {submitting ? "Saving..." : "Update password"}
                        </button>
                        <button type="button" onClick={() => setChangingPassword(false)} className="rounded-xl bg-surface-muted px-5 py-2.5 text-[14px] font-semibold hover:bg-border">
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                <div className="surface-card flex items-center justify-between gap-6 p-7">
                  <div>
                    <h3 className="text-[16px] font-semibold tracking-[-0.01em]">Sign out</h3>
                    <p className="mt-0.5 text-[13px] text-muted">End your session on this device.</p>
                  </div>
                  <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="rounded-xl bg-danger-bg px-5 py-2.5 text-[14px] font-semibold text-danger hover:opacity-80">
                    Log out
                  </button>
                </div>
              </>
            )}

            {tab === "agency" && canAgency && (
              <>
                <TabIntro title="Agency" text="How your agency appears in the sidebar, on shared listing pages and in WhatsApp messages." />
                <AgencyBrandingCard />
              </>
            )}

            {tab === "integrations" && canIntegrations && (
              <>
                <TabIntro title="Portals & feeds" text="Connect Property Finder and give other portals and your website a feed of your listings." />
                <div className="flex flex-col gap-5">
                  <PropertyFinderSettingsCard />
                  <PortalFeedCard portal="WEBSITE" slug="website.json" label="Website" />
                  <PortalFeedCard portal="PROPERTY_FINDER" slug="pf.xml" label="Property Finder" />
                  <QatarLivingApiCard />
                  <PortalFeedCard portal="PROPERTY_ORYX" slug="oryx.xml" label="Property Oryx" />
                  <MasterFeedCard />
                </div>
              </>
            )}

            {tab === "lead-sources" && canIntegrations && (
              <>
                <TabIntro title="Lead sources" text="Bring leads in from your ads automatically." />
                <MetaLeadsSettingsCard />
              </>
            )}

            {tab === "ai" && canIntegrations && (
              <>
                <TabIntro title="AI writing" text="Powers the Write with AI buttons for listing titles and descriptions. Your key is stored securely on the server." />
                <OpenAiSettingsCard />
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- Phone: a settings menu; each row opens its own screen with a back arrow.
  const phoneInput = "w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-primary";
  const phoneRows: { key: SettingsTab; label: string; hint: string; icon: React.ReactNode; tint: string }[] = [
    { key: "profile", label: "My profile", hint: "Name, email and WhatsApp", icon: <IconUsers size={20} />, tint: "bg-indigo-50 text-indigo-600" },
    { key: "security", label: "Password & security", hint: "Change your password", icon: <IconLock size={20} />, tint: "bg-slate-100 text-slate-600" },
  ];
  const phoneAdminRows: { key: SettingsTab; label: string; hint: string; icon: React.ReactNode; tint: string }[] = [
    { key: "agency", label: "Agency", hint: "Name and logo", icon: <IconBuilding size={20} />, tint: "bg-violet-50 text-violet-600" },
    { key: "lead-sources", label: "Lead sources", hint: "Facebook & Instagram ads", icon: <IconUsers size={20} />, tint: "bg-sky-50 text-sky-600" },
    { key: "integrations", label: "Portals & feeds", hint: "Property Finder, Oryx, website", icon: <IconGlobe size={20} />, tint: "bg-emerald-50 text-emerald-600" },
    { key: "ai", label: "AI writing", hint: "OpenAI key", icon: <IconSettings size={20} />, tint: "bg-amber-50 text-amber-600" },
  ];
  const chevron = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-subtle)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
  const phoneRow = (r: { key: SettingsTab; label: string; hint: string; icon: React.ReactNode; tint: string }) => (
    <button key={r.key} type="button" onClick={() => openSection(r.key)} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left active:bg-surface-muted">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${r.tint}`}>{r.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{r.label}</span>
        <span className="block truncate text-[12.5px] text-muted">{r.hint}</span>
      </span>
      {chevron}
    </button>
  );
  const sectionTitle = [...phoneRows, ...phoneAdminRows].find((r) => r.key === section)?.label ?? "";

  const avatarPicker = (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarSelected} className="hidden" />
    </>
  );

  if (!section || !sectionAllowed(section)) {
    return (
      <div className="page-in px-4 pb-10">
        <div className="safe-top pb-3 pt-4">
          <h1 className="text-xl font-bold">Settings</h1>
        </div>

        <div className="surface-card flex items-center gap-4 p-4">
          <div className="relative shrink-0">
            <Avatar name={user.name ?? "?"} avatarUrl={profile?.avatarUrl} size={64} className="text-xl" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              aria-label="Change profile photo"
              className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-800 active:opacity-80 disabled:opacity-60"
            >
              {avatarUploading ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--surface-elevated)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              )}
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-semibold">{user.name}</h2>
            <p className="truncate text-[13px] text-muted">{user.email}</p>
            <span className="mt-1.5 inline-block rounded-full bg-accent-light px-2.5 py-0.5 text-[11px] font-medium text-primary">{ROLE_LABELS[user.role]}</span>
          </div>
        </div>
        {avatarError && <div className="mt-2 rounded-xl bg-danger-bg px-3 py-2 text-[12.5px] text-danger">{avatarError}</div>}
        {avatarPicker}

        <p className="mb-2 mt-6 px-1 text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">Account</p>
        <div className="surface-card divide-y divide-slate-100 overflow-hidden">{phoneRows.map(phoneRow)}</div>

        <p className="mb-2 mt-6 px-1 text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">Insights</p>
        <div className="surface-card divide-y divide-slate-100 overflow-hidden">
          {[
            ...(can(user, "dashboard.view") ? [{ href: "/dashboard", label: "Dashboard", hint: "Leads, listings and charts for the whole agency" }] : []),
            { href: "/dashboard/activities", label: "Activities", hint: "A timeline of everything that was done" },
          ].map((r) => (
            <Link key={r.href} href={r.href} className="flex items-center gap-3.5 px-4 py-3.5 active:bg-surface-muted">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{r.label}</span>
                <span className="block truncate text-[12.5px] text-muted">{r.hint}</span>
              </span>
              {chevron}
            </Link>
          ))}
        </div>

        {isAdmin && (
          <>
            <p className="mb-2 mt-6 px-1 text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">Team</p>
            <div className="surface-card overflow-hidden">
              <Link href="/admin/users" className="flex items-center gap-3.5 px-4 py-3.5 active:bg-surface-muted">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <IconUsers size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">Users</span>
                  <span className="block truncate text-[12.5px] text-muted">Add agents, reset passwords, link Property Finder</span>
                </span>
                {chevron}
              </Link>
            </div>

            <p className="mb-2 mt-6 px-1 text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">Agency settings</p>
            <div className="surface-card divide-y divide-slate-100 overflow-hidden">{phoneAdminRows.map(phoneRow)}</div>
          </>
        )}

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-6 w-full rounded-2xl bg-danger-bg py-3.5 text-[14.5px] font-semibold text-danger active:opacity-70"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className="page-in px-4 pb-10">
      <div className="safe-top sticky top-0 z-10 -mx-4 mb-3 flex items-center gap-1 border-b border-slate-100 bg-background/95 px-2 py-2.5 backdrop-blur">
        <button type="button" onClick={closeSection} aria-label="Back to settings" className="flex h-10 w-10 items-center justify-center rounded-full active:bg-surface-muted">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
        <h1 className="text-[17px] font-semibold">{sectionTitle}</h1>
      </div>

      <div className="flex flex-col gap-4">
        {section === "profile" && (
          <div className="surface-card divide-y divide-slate-100 px-4">
            <div className="flex items-center justify-between gap-4 py-3.5 text-[14px]">
              <span className="text-muted">Name</span>
              <span className="min-w-0 truncate font-medium">{user.name}</span>
            </div>
            <div className="flex items-center justify-between gap-4 py-3.5 text-[14px]">
              <span className="text-muted">Email</span>
              <span className="min-w-0 truncate font-medium">{user.email}</span>
            </div>
            {!editingWhatsapp ? (
              <div className="flex items-center justify-between gap-4 py-3.5 text-[14px]">
                <span className="text-muted">WhatsApp</span>
                <span className="flex min-w-0 items-center gap-3">
                  <span className="truncate font-medium">{profile?.whatsapp ?? "—"}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setWhatsappInput(profile?.whatsapp ?? "");
                      setWhatsappError("");
                      setEditingWhatsapp(true);
                    }}
                    className="text-[13px] font-semibold text-primary"
                  >
                    Edit
                  </button>
                </span>
              </div>
            ) : (
              <form onSubmit={submitWhatsappChange} className="flex flex-col gap-2 py-3.5">
                <label className="block text-sm font-medium">WhatsApp number</label>
                <input type="tel" required value={whatsappInput} onChange={(e) => setWhatsappInput(e.target.value)} placeholder="e.g. +974 5000 0000" className={phoneInput} />
                {whatsappError && <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{whatsappError}</div>}
                <div className="mt-1 flex gap-2">
                  <button type="button" onClick={() => setEditingWhatsapp(false)} className="flex-1 rounded-xl bg-surface-muted py-3 text-[14px] font-semibold active:opacity-70">
                    Cancel
                  </button>
                  <button type="submit" disabled={whatsappSaving} className="flex-1 rounded-xl py-3 text-[14px] font-semibold text-white active:opacity-80 disabled:opacity-60" style={{ background: "var(--primary)" }}>
                    {whatsappSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            )}
            <div className="flex items-center justify-between gap-4 py-3.5 text-[14px]">
              <span className="text-muted">Status</span>
              <span className="font-semibold" style={{ color: user.status === "ACTIVE" ? "var(--success)" : "var(--danger)" }}>
                {user.status === "ACTIVE" ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        )}

        {section === "security" && (
          <div className="surface-card p-4">
            <h3 className="text-[15px] font-semibold">Password</h3>
            <p className="mt-0.5 text-[13px] text-muted">Use at least 8 characters.</p>
            {!changingPassword ? (
              <button type="button" onClick={() => setChangingPassword(true)} className="mt-4 w-full rounded-xl bg-surface-muted py-3.5 text-[14px] font-semibold active:opacity-70">
                Change password
              </button>
            ) : (
              <form onSubmit={submitPasswordChange} className="mt-4 flex flex-col gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Current password</label>
                  <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={phoneInput} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">New password</label>
                  <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={phoneInput} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Confirm new password</label>
                  <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={phoneInput} />
                </div>
                {error && <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>}
                {success && <div className="rounded-xl bg-success-bg px-4 py-3 text-sm" style={{ color: "var(--success)" }}>Password updated.</div>}
                <div className="mt-1 flex gap-3">
                  <button type="button" onClick={() => setChangingPassword(false)} className="flex-1 rounded-xl bg-surface-muted py-3 text-[14px] font-semibold active:opacity-70">
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting} className="flex-1 rounded-xl py-3 text-[14px] font-semibold text-white active:opacity-80 disabled:opacity-60" style={{ background: "var(--primary)" }}>
                    {submitting ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {section === "agency" && canAgency && <AgencyBrandingCard />}
        {section === "lead-sources" && canIntegrations && <MetaLeadsSettingsCard />}
        {section === "integrations" && canIntegrations && (
          <>
            <PropertyFinderSettingsCard />
            <PortalFeedCard portal="WEBSITE" slug="website.json" label="Website" />
            <PortalFeedCard portal="PROPERTY_FINDER" slug="pf.xml" label="Property Finder" />
            <QatarLivingApiCard />
            <PortalFeedCard portal="PROPERTY_ORYX" slug="oryx.xml" label="Property Oryx" />
            <MasterFeedCard />
          </>
        )}
        {section === "ai" && canIntegrations && <OpenAiSettingsCard />}
      </div>
    </div>
  );
}

function TabIntro({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="mt-1 max-w-2xl text-[14px] text-muted">{text}</p>
    </div>
  );
}
