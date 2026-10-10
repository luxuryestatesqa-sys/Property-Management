"use client";

import { useState } from "react";
import { ListingDTO, AvailabilityStatus } from "@/lib/types";
import { useConfirm } from "@/components/ConfirmDialog";
import { extractErrorMessage } from "@/lib/errors";

// The owner-side actions on a listing (activate/deactivate, delete, change
// availability), shared by the phone card and the desktop table row so both
// confirm and call the API identically.
export function useListingActions(listing: ListingDTO, onChange: () => void) {
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const confirm = useConfirm();

  async function toggleStatus() {
    const nextStatus = listing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const confirmed =
      nextStatus === "INACTIVE"
        ? await confirm({
            title: "Deactivate Listing?",
            message: "It will be hidden from active search. You can reactivate it anytime.",
            confirmLabel: "Deactivate",
            danger: true,
          })
        : await confirm({
            title: "Reactivate Listing?",
            message: "It will become visible in active search results again.",
            confirmLabel: "Reactivate",
          });
    if (!confirmed) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/listings/${listing.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) onChange();
    } finally {
      setBusy(false);
    }
  }

  async function deleteListing() {
    const confirmed = await confirm({
      title: "Delete Listing?",
      message: "This permanently removes it, including its photos and history - it can't be undone. If it's currently on Property Finder, it will be unpublished first. Deactivate instead if you might want it back.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/listings/${listing.id}`, { method: "DELETE" });
      if (res.ok) {
        onChange();
      } else {
        const data = await res.json().catch(() => null);
        setDeleteError(extractErrorMessage(data?.error, "Failed to delete listing"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function changeAvailability(next: AvailabilityStatus) {
    if (next === listing.availabilityStatus) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availabilityStatus: next }),
      });
      if (res.ok) onChange();
    } finally {
      setBusy(false);
    }
  }

  return { busy, deleteError, toggleStatus, deleteListing, changeAvailability };
}
