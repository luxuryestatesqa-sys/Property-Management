"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { UserDTO } from "@/lib/types";
import { resizeImageFile } from "@/lib/image";
import { extractErrorMessage } from "@/lib/errors";
import Avatar from "@/components/Avatar";
import ProfileSkeleton from "@/components/ProfileSkeleton";

const MAX_AVATAR_SOURCE_BYTES = 10 * 1024 * 1024; // 10MB raw upload cap, before client-side resize

export default function ProfilePage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<UserDTO | null>(null);
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

  return (
    <div className="px-4 pb-10">
      <div className="safe-top pt-4 pb-3">
        <h1 className="text-xl font-bold">Profile</h1>
      </div>

      <div className="flex flex-col items-center py-6">
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
          {user.role === "ADMIN" ? "Administrator" : "Agent"}
        </span>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3">
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

      {!changingPassword ? (
        <div className="flex flex-col gap-3 mt-5">
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
        <form onSubmit={submitPasswordChange} className="flex flex-col gap-3 mt-5 rounded-2xl border border-border bg-surface p-4">
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
  );
}
