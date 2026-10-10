import { ListingDTO } from "@/lib/types";
import { AVAILABILITY_LABELS, AVAILABILITY_COLORS } from "@/lib/availability";
import { IconLock } from "./icons";

type ListingType = ListingDTO["listingType"];
type Availability = ListingDTO["availabilityStatus"];

const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none whitespace-nowrap";

export function TypePill({ type, solid }: { type: ListingType; solid?: boolean }) {
  const rent = type === "RENT";
  return (
    <span
      className={base}
      style={
        solid
          ? { background: "rgba(255,255,255,.95)", color: rent ? "var(--rent-text)" : "var(--sale-text)" }
          : { background: rent ? "var(--rent-bg)" : "var(--sale-bg)", color: rent ? "var(--rent-text)" : "var(--sale-text)" }
      }
    >
      {rent ? "For Rent" : "For Sale"}
    </span>
  );
}

export function AvailabilityPill({ status }: { status: Availability }) {
  const c = AVAILABILITY_COLORS[status];
  return (
    <span className={base} style={{ background: c.bg, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.text }} />
      {AVAILABILITY_LABELS[status]}
    </span>
  );
}

export function PrivatePill() {
  return (
    <span className={`${base} bg-surface-muted text-muted`}>
      <IconLock size={11} />
      Private
    </span>
  );
}

export function StatusDot({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: active ? "var(--success)" : "var(--muted)" }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? "var(--success)" : "var(--muted)" }} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}
