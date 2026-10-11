"use client";

import { useEffect, useRef, useState } from "react";
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
import { isAdminRole, ROLE_LABELS } from "@/lib/roles";
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
  // Coming back from Facebook lands on ?tab=lead-sources.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "lead-sources" || t === "integrations" || t === "agency" || t === "security" || t === "ai") setTab(t);
  }, []);
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
  const isAdmin = isAdminRole(user.role);

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
      setError("New password must be at least 6 characters");
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
    const nav: { key: SettingsTab; label: string; hint: string; icon: React.ReactNode; admin?: boolean }[] = [
      { key: "profile", label: "Profile", hint: "Your details and photo", icon: <IconUsers size={18} /> },
      { key: "security", label: "Security", hint: "Password and sign out", icon: <IconLock size={18} /> },
      { key: "agency", label: "Agency", hint: "Name and logo", icon: <IconBuilding size={18} />, admin: true },
      { key: "integrations", label: "Portals & feeds", hint: "Property Finder and more", icon: <IconGlobe size={18} />, admin: true },
      { key: "lead-sources", label: "Lead sources", hint: "Facebook & Instagram ads", icon: <IconUsers size={18} />, admin: true },
      { key: "ai", label: "AI writing", hint: "OpenAI key", icon: <IconSettings size={18} />, admin: true },
    ];
    const visible = nav.filter((n) => !n.admin || isAdmin);
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
                <div className="surface-card overflow-hidden">
                  <div className="h-28" style={{ background: "var(--brand-gradient)" }} />
                  <div className="px-7 pb-7">
                    <div className="-mt-12 flex items-end justify-between">
                      <div className="relative">
                        <div className="rounded-full ring-4 ring-white">
                          <Avatar name={user.name ?? "?"} avatarUrl={profile?.avatarUrl} size={96} className="text-3xl" />
                        </div>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={avatarUploading}
                          aria-label="Change profile photo"
                          className="absolute -bottom-0.5 -right-0.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-slate-800 text-white shadow transition-colors hover:bg-slate-700 disabled:opacity-60"
                        >
                          {avatarUploading ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                              <circle cx="12" cy="13" r="4" />
                            </svg>
                          )}
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarSelected} className="hidden" />
                      </div>
                      <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-success-bg px-3 py-1.5 text-[12px] font-semibold" style={{ color: "var(--success)" }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} />
                        {user.status === "ACTIVE" ? "Active account" : "Inactive"}
                      </span>
                    </div>
                    {avatarError && <div className="mt-3 rounded-xl bg-danger-bg px-3 py-2 text-[12.5px] text-danger">{avatarError}</div>}
                    <div className="mt-4 flex items-center gap-3">
                      <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{user.name}</h2>
                      <span className="rounded-full bg-accent-light px-2.5 py-1 text-[11.5px] font-semibold text-primary">{roleLabel}</span>
                    </div>
                    <p className="mt-0.5 text-[14px] text-muted">{user.email}</p>
                  </div>
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
                        <input type="tel" required value={whatsappInput} onChange={(e) => setWhatsappInput(e.target.value)} placeholder="+974 5000 0000" className={inputCls} />
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
                  <p className="mt-0.5 text-[13px] text-muted">Use at least 6 characters. You will stay signed in on this device.</p>
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

            {tab === "agency" && isAdmin && (
              <>
                <TabIntro title="Agency" text="How your agency appears in the sidebar, on shared listing pages and in WhatsApp messages." />
                <AgencyBrandingCard />
              </>
            )}

            {tab === "integrations" && isAdmin && (
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

            {tab === "lead-sources" && isAdmin && (
              <>
                <TabIntro title="Lead sources" text="Bring leads in from your ads automatically." />
                <MetaLeadsSettingsCard />
              </>
            )}

            {tab === "ai" && isAdmin && (
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

  return (
    <div className="px-4 pb-10 lg:px-0">
      <div className="safe-top pt-4 pb-3 lg:pt-8 lg:pb-5">
        <h1 className="text-xl font-bold lg:text-3xl lg:tracking-tight">Settings</h1>
        <p className="hidden lg:block text-[14px] text-muted mt-1">Your account{isAdmin ? ", portal integrations and feeds" : ""}.</p>
      </div>

      <div
        className={`lg:grid lg:gap-x-8 lg:items-start ${
          isAdmin ? "lg:grid-cols-[400px_minmax(0,1fr)] lg:grid-rows-[auto_auto_1fr]" : "lg:max-w-xl"
        }`}
      >
      <div className="flex flex-col items-center py-6 lg:col-start-1">
        <div className="relative mb-3">
          <Avatar name={user.name ?? "?"} avatarUrl={profile?.avatarUrl} size={80} className="text-2xl" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            aria-label="Change profile photo"
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center border-2 border-background active:opacity-80 disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            {avatarUploading ? (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarSelected}
            className="hidden"
          />
        </div>
        {avatarError && <div className="rounded-xl bg-danger-bg text-danger text-[12px] px-3 py-2 mb-2">{avatarError}</div>}
        <h2 className="text-lg font-bold">{user.name}</h2>
        <span
          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg mt-1.5"
          style={{ background: "var(--accent-light)", color: "var(--primary)" }}
        >
          {ROLE_LABELS[user.role]}
        </span>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3 lg:col-start-1 lg:p-5">
        <div className="flex justify-between text-[14px]">
          <span className="text-muted">Agent Name</span>
          <span className="font-medium">{user.name}</span>
        </div>

        {!editingWhatsapp ? (
          <div className="flex justify-between items-center text-[14px]">
            <span className="text-muted">WhatsApp Number</span>
            <div className="flex items-center gap-2">
              <span className="font-medium">{profile?.whatsapp ?? "—"}</span>
              <button
                onClick={() => {
                  setWhatsappInput(profile?.whatsapp ?? "");
                  setWhatsappError("");
                  setEditingWhatsapp(true);
                }}
                className="text-[12px] font-semibold"
                style={{ color: "var(--primary)" }}
              >
                Edit
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submitWhatsappChange} className="flex flex-col gap-2 border-t border-border pt-3">
            <label className="text-sm font-medium block">WhatsApp Number</label>
            <input
              type="tel"
              required
              value={whatsappInput}
              onChange={(e) => setWhatsappInput(e.target.value)}
              placeholder="+974 5000 0000"
              className="w-full rounded-xl border border-border px-4 py-3 text-base outline-none focus:border-primary"
            />
            {whatsappError && <div className="rounded-xl bg-danger-bg text-danger text-sm px-4 py-3">{whatsappError}</div>}
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => setEditingWhatsapp(false)}
                className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold bg-surface-muted active:opacity-70"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={whatsappSaving}
                className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold text-white active:opacity-80 disabled:opacity-60"
                style={{ background: "var(--primary)" }}
              >
                {whatsappSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        )}

        <div className="flex justify-between text-[14px]">
          <span className="text-muted">Email</span>
          <span className="font-medium">{user.email}</span>
        </div>
        <div className="flex justify-between text-[14px]">
          <span className="text-muted">Account Status</span>
          <span className="font-semibold" style={{ color: "var(--success)" }}>
            {user.status === "ACTIVE" ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {isAdmin && (
        <div className="mt-5 lg:mt-0 lg:col-start-2 lg:row-start-1 lg:row-span-3">
          <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2 px-1">Agency</h2>
          <div className="flex flex-col gap-3 mb-5">
            <AgencyBrandingCard />
          </div>
          <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2 px-1">Lead sources</h2>
          <div className="flex flex-col gap-3 mb-5">
            <MetaLeadsSettingsCard />
          </div>
          <h2 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2 px-1">Portal Integrations</h2>
          <div className="flex flex-col gap-3">
            <PropertyFinderSettingsCard />
            <PortalFeedCard portal="WEBSITE" slug="website.json" label="Website" />
            <PortalFeedCard portal="PROPERTY_FINDER" slug="pf.xml" label="Property Finder" />
            <QatarLivingApiCard />
            <PortalFeedCard portal="PROPERTY_ORYX" slug="oryx.xml" label="Property Oryx" />
            <MasterFeedCard />
            <OpenAiSettingsCard />
          </div>
        </div>
      )}

      {!changingPassword ? (
        <div className="flex flex-col gap-3 mt-5 lg:col-start-1">
          <button
            onClick={() => setChangingPassword(true)}
            className="w-full rounded-xl py-3.5 text-[14px] font-semibold text-foreground bg-surface-muted active:opacity-70"
          >
            Change Password
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full rounded-xl py-3.5 text-[14px] font-semibold bg-danger-bg text-danger active:opacity-70"
          >
            Log Out
          </button>
        </div>
      ) : (
        <form onSubmit={submitPasswordChange} className="flex flex-col gap-3 mt-5 rounded-2xl border border-border bg-surface p-4 lg:col-start-1 lg:p-5">
          <h3 className="font-semibold text-[15px]">Change Password</h3>
          <div>
            <label className="text-sm font-medium block mb-1.5">Current Password</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-xl border border-border px-4 py-3 text-base outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">New Password</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-border px-4 py-3 text-base outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">Confirm New Password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-border px-4 py-3 text-base outline-none focus:border-primary"
            />
          </div>
          {error && <div className="rounded-xl bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>}
          {success && <div className="rounded-xl bg-success-bg text-sm px-4 py-3" style={{ color: "var(--success)" }}>Password updated.</div>}
          <div className="flex gap-3 mt-1">
            <button
              type="button"
              onClick={() => setChangingPassword(false)}
              className="flex-1 rounded-xl py-3 text-[14px] font-semibold bg-surface-muted active:opacity-70"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-xl py-3 text-[14px] font-semibold text-white active:opacity-80 disabled:opacity-60"
              style={{ background: "var(--primary)" }}
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      )}
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
