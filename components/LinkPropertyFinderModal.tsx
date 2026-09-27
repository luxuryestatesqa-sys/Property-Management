"use client";

import { useEffect, useState } from "react";
import { extractErrorMessage } from "@/lib/errors";
import SearchableSelect from "./SearchableSelect";

interface PFUserOption {
  publicProfileId: number;
  name: string;
  email: string;
}

interface LinkPropertyFinderModalProps {
  user: { id: string; name: string; pfPublicProfileId: number | null };
  onClose: () => void;
  onSaved: () => void;
}

export default function LinkPropertyFinderModal({ user, onClose, onSaved }: LinkPropertyFinderModalProps) {
  const [options, setOptions] = useState<PFUserOption[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<number | null>(user.pfPublicProfileId);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/portals/propertyfinder/users");
        const data = await res.json();
        if (!res.ok) {
          setLoadError(extractErrorMessage(data.error, "Failed to load Property Finder accounts"));
          return;
        }
        setOptions(data.users);
      } catch {
        setLoadError("Network error. Please try again.");
      }
    })();
  }, []);

  async function submit() {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pfPublicProfileId: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(extractErrorMessage(data.error, "Failed to save"));
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto">
        <div className="px-5 py-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Link Property Finder Account</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-muted text-muted">
              ✕
            </button>
          </div>
          <p className="text-sm text-muted -mt-2">
            Choose which Property Finder account <span className="font-semibold text-foreground">{user.name}</span> publishes as.
            Listings they publish will be attributed to this account, and its leads will route there too.
          </p>

          {loadError && <div className="rounded-xl bg-danger-bg text-danger text-sm px-4 py-3">{loadError}</div>}

          {!loadError && !options && (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-xl bg-surface-muted animate-pulse" />
              ))}
            </div>
          )}

          {options && options.length === 0 && (
            <p className="text-sm text-muted">No Property Finder accounts found on this agency&apos;s PF Expert account.</p>
          )}

          {options && options.length > 0 && (
            <SearchableSelect
              value={selected !== null ? String(selected) : null}
              onChange={(v) => setSelected(v ? Number(v) : null)}
              options={options.map((opt) => ({ label: `${opt.name} — ${opt.email}`, value: String(opt.publicProfileId) }))}
              placeholder="Not linked"
              searchPlaceholder="Search agents by name or email..."
            />
          )}

          {error && <div className="rounded-xl bg-danger-bg text-danger text-sm px-4 py-3">{error}</div>}

          <button
            type="button"
            onClick={submit}
            disabled={submitting || !options}
            className="w-full rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80 disabled:opacity-60 mt-1"
            style={{ background: "var(--primary)" }}
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
