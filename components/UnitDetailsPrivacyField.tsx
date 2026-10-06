"use client";

import SegmentedControl from "@/components/SegmentedControl";

// Chooses who sees the exact floor and unit number: "Only me" hides them from
// other agents (and from the public share link); the building stays visible.
export default function UnitDetailsPrivacyField({
  value,
  onChange,
  unitLabel,
  showFloor,
}: {
  value: boolean;
  onChange: (hidden: boolean) => void;
  unitLabel: string;
  showFloor: boolean;
}) {
  const what = showFloor ? `floor and ${unitLabel.toLowerCase()}` : unitLabel.toLowerCase();
  return (
    <div>
      <span className="text-sm font-medium text-foreground block mb-1.5">Who can see the {what}?</span>
      <SegmentedControl
        options={[
          { label: "🔒 Only me", value: "ONLY_ME" },
          { label: "👥 Everyone", value: "EVERYONE" },
        ]}
        value={value ? "ONLY_ME" : "EVERYONE"}
        onChange={(v) => onChange(v === "ONLY_ME")}
      />
      <p className="text-[12px] text-muted mt-1.5">
        {value
          ? `Only you (and admins) will see the ${what}. Other agents see the building only, and can't search by it.`
          : `Every agent can see the ${what}.`}
      </p>
    </div>
  );
}
