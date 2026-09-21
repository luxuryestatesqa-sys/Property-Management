"use client";

import { useCallback, useEffect, useState } from "react";
import { ListingDTO } from "@/lib/types";
import MyListingCard from "@/components/MyListingCard";

type Tab = "ACTIVE" | "INACTIVE";

export default function MyListingsPage() {
  const [tab, setTab] = useState<Tab>("ACTIVE");
  const [listings, setListings] = useState<ListingDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ ACTIVE: 0, INACTIVE: 0 });

  const load = useCallback(async (currentTab: Tab) => {
    setLoading(true);
    try {
      const [activeRes, inactiveRes] = await Promise.all([
        fetch(`/api/listings?mine=1&status=ACTIVE&page=1`),
        fetch(`/api/listings?mine=1&status=INACTIVE&page=1`),
      ]);
      const activeData = await activeRes.json();
      const inactiveData = await inactiveRes.json();
      setCounts({ ACTIVE: activeData.total, INACTIVE: inactiveData.total });
      setListings(currentTab === "ACTIVE" ? activeData.listings : inactiveData.listings);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

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
              <div key={i} className="rounded-2xl bg-surface border border-border p-4 h-44 animate-pulse" />
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
              <MyListingCard key={l.id} listing={l} onStatusChange={() => load(tab)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
