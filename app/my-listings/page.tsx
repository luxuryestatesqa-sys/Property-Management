"use client";

import { useCallback, useEffect, useState } from "react";
import { ListingDTO } from "@/lib/types";
import MyListingCard from "@/components/MyListingCard";
import MyListingCardSkeleton from "@/components/MyListingCardSkeleton";

type Tab = "ACTIVE" | "INACTIVE";

export default function MyListingsPage() {
  const [tab, setTab] = useState<Tab>("ACTIVE");
  const [listingsByTab, setListingsByTab] = useState<Record<Tab, ListingDTO[]>>({ ACTIVE: [], INACTIVE: [] });
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ ACTIVE: 0, INACTIVE: 0 });

  // Both tabs' data is fetched together, so switching tabs is instant - no
  // refetch or loading flash on every tap, only on first load and after a
  // status/availability change.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [activeRes, inactiveRes] = await Promise.all([
        fetch(`/api/listings?mine=1&status=ACTIVE&page=1`),
        fetch(`/api/listings?mine=1&status=INACTIVE&page=1`),
      ]);
      const activeData = await activeRes.json();
      const inactiveData = await inactiveRes.json();
      setCounts({ ACTIVE: activeData.total, INACTIVE: inactiveData.total });
      setListingsByTab({ ACTIVE: activeData.listings, INACTIVE: inactiveData.listings });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const listings = listingsByTab[tab];

  return (
    <div>
      <div className="sticky top-0 z-20 bg-background safe-top pt-4 pb-3 px-4 border-b border-border">
        <h1 className="text-xl font-bold mb-3">My Listings</h1>
        <div className="flex bg-surface-muted rounded-xl p-1 gap-1">
          {(["ACTIVE", "INACTIVE"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 text-[14px] font-medium py-2.5 rounded-lg ${tab === t ? "bg-surface shadow-sm" : "text-muted"}`}
              style={tab === t ? { color: "var(--primary)" } : undefined}
            >
              {t === "ACTIVE" ? "Active" : "Inactive"} ({counts[t]})
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <MyListingCardSkeleton key={i} />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16 text-muted">
            <div className="text-4xl mb-3">📋</div>
            <p className="font-medium text-foreground">No {tab === "ACTIVE" ? "active" : "inactive"} listings</p>
            <p className="text-sm mt-1">
              {tab === "ACTIVE" ? "Properties you add will appear here." : "Deactivated listings will appear here."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {listings.map((l) => (
              <MyListingCard key={l.id} listing={l} onStatusChange={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
