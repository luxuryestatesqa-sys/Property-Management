"use client";

import SegmentedControl from "@/components/SegmentedControl";
import type { ListingVisibility } from "@/lib/types";

// Private/Shared switch used when adding or editing a listing: Private keeps
// it visible to its own agent (and admins) only, Shared opens it to every agent.
export default function VisibilityField({
  value,
  onChange,
}: {
  value: ListingVisibility;
  onChange: (v: ListingVisibility) => void;
}) {
  return (
    <div>
      <SegmentedControl
        options={[
          { label: "🔒 Only me", value: "PRIVATE" },
          { label: "👥 Shared with company", value: "SHARED" },
        ]}
        value={value}
        onChange={onChange}
      />
      <p className="text-[12px] text-muted mt-1.5">
        {value === "PRIVATE"
          ? "Only you (and admins) can see this listing. It won't appear in search for other agents or in portal feeds."
          : "Every agent in the company can see this listing."}
      </p>
    </div>
  );
}
