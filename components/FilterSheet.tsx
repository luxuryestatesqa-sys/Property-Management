"use client";

import { useEffect, useState } from "react";
import { Filters, DEFAULT_FILTERS, RENT_BOUNDS, SALE_BOUNDS } from "@/lib/filters";
import { formatCompactQAR } from "@/lib/format";
import { AVAILABILITY_LABELS } from "@/lib/availability";
import { PROPERTY_CATEGORY_LABELS, PROPERTY_CATEGORY_OPTIONS, BEDROOM_LABELS, BEDROOM_OPTIONS } from "@/lib/propertyCategory";
import DualRangeSlider from "./DualRangeSlider";
import SegmentedControl from "./SegmentedControl";
import ChipSelect from "./ChipSelect";
import CollapsibleChipSelect from "./CollapsibleChipSelect";

const AVAILABILITY_OPTIONS: { label: string; value: Filters["availability"] }[] = [
  { label: "All", value: "ALL" },
  { label: AVAILABILITY_LABELS.AVAILABLE, value: "AVAILABLE" },
  { label: AVAILABILITY_LABELS.RESERVED, value: "RESERVED" },
  { label: AVAILABILITY_LABELS.RENTED, value: "RENTED" },
  { label: AVAILABILITY_LABELS.SOLD, value: "SOLD" },
];

const PROPERTY_TYPE_FILTER_OPTIONS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  ...PROPERTY_CATEGORY_OPTIONS.map((c) => ({ label: PROPERTY_CATEGORY_LABELS[c], value: c })),
];

const BEDROOM_FILTER_OPTIONS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  ...BEDROOM_OPTIONS.map((b) => ({ label: BEDROOM_LABELS[b], value: b })),
];

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onApply: (filters: Filters) => void;
  isAdmin: boolean;
}

const RENT_QUICK_OPTIONS = [
  { label: "Under QAR 5K", min: RENT_BOUNDS.min, max: 5000 },
  { label: "QAR 5K–10K", min: 5000, max: 10000 },
  { label: "QAR 10K–20K", min: 10000, max: 20000 },
  { label: "QAR 20K+", min: 20000, max: RENT_BOUNDS.max },
];

function LocationSelect({
  label,
  value,
  onChange,
  level,
  area,
  community,
  disabled,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  level: "area" | "community" | "building";
  area?: string | null;
  community?: string | null;
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    if (disabled) {
      setOptions([]);
      return;
    }
    const params = new URLSearchParams({ level });
    if (level === "community" && area) params.set("area", area);
    if (level === "building") {
      if (area) params.set("area", area);
      if (community) params.set("community", community);
    }
    fetch(`/api/locations?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setOptions(d.values ?? []))
      .catch(() => setOptions([]));
  }, [level, area, community, disabled]);

  return (
    <div>
      <label className="text-sm font-medium text-foreground block mb-1.5">{label}</label>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary disabled:bg-surface-muted disabled:text-muted appearance-none"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function FilterSheet({ open, onClose, filters, onApply, isAdmin }: FilterSheetProps) {
  const [draft, setDraft] = useState<Filters>(filters);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => setAgents(d.agents ?? []))
      .catch(() => setAgents([]));
  }, [open]);

  if (!open) return null;

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background rounded-t-3xl max-h-[88vh] flex flex-col mx-auto w-full max-w-md">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold">Filters</h2>
          <button type="button" onClick={onClose} aria-label="Close filters" className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-muted text-muted">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-6 no-scrollbar">
          {/* Property type + bedrooms first - this is what most agents filter
              by first (e.g. "Studio", "1 Bedroom"), so it leads the sheet. */}
          <CollapsibleChipSelect
            label="Property Type"
            options={PROPERTY_TYPE_FILTER_OPTIONS}
            value={draft.propertyCategory ?? ""}
            onChange={(v) => update("propertyCategory", (v || null) as Filters["propertyCategory"])}
            defaultOpen
          />

          <CollapsibleChipSelect
            label="Bedrooms"
            options={BEDROOM_FILTER_OPTIONS}
            value={draft.bedrooms ?? ""}
            onChange={(v) => update("bedrooms", (v || null) as Filters["bedrooms"])}
            defaultOpen
          />

          <section>
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Location</h3>
            <div className="flex flex-col gap-3">
              <LocationSelect
                label="Location"
                level="area"
                value={draft.area}
                onChange={(v) => setDraft((p) => ({ ...p, area: v, community: null, building: null }))}
              />
              <LocationSelect
                label="Area / Community"
                level="community"
                value={draft.community}
                area={draft.area}
                disabled={!draft.area}
                onChange={(v) => setDraft((p) => ({ ...p, community: v, building: null }))}
              />
              <LocationSelect
                label="Building"
                level="building"
                value={draft.building}
                area={draft.area}
                community={draft.community}
                disabled={!draft.community}
                onChange={(v) => setDraft((p) => ({ ...p, building: v }))}
              />
            </div>
          </section>

          <section>
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Listing Type</h3>
            <SegmentedControl
              options={[
                { label: "All", value: "ALL" },
                { label: "For Rent", value: "RENT" },
                { label: "For Sale", value: "SALE" },
              ]}
              value={draft.listingType}
              onChange={(v) => update("listingType", v)}
            />
          </section>

          {draft.listingType === "RENT" && (
            <section>
              <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Monthly Rent</h3>
              <DualRangeSlider
                min={RENT_BOUNDS.min}
                max={RENT_BOUNDS.max}
                step={RENT_BOUNDS.step}
                valueMin={draft.rentMin ?? RENT_BOUNDS.min}
                valueMax={draft.rentMax ?? RENT_BOUNDS.max}
                onChange={(mn, mx) => setDraft((p) => ({ ...p, rentMin: mn, rentMax: mx }))}
                formatValue={(v) => formatCompactQAR(v)}
              />
              <div className="flex flex-wrap gap-2 mt-3">
                {RENT_QUICK_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, rentMin: opt.min, rentMax: opt.max }))}
                    className="text-[12px] font-medium px-3 py-2 rounded-lg bg-surface-muted text-foreground active:opacity-70"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {draft.listingType === "SALE" && (
            <section>
              <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Sale Price</h3>
              <DualRangeSlider
                min={SALE_BOUNDS.min}
                max={SALE_BOUNDS.max}
                step={SALE_BOUNDS.step}
                valueMin={draft.saleMin ?? SALE_BOUNDS.min}
                valueMax={draft.saleMax ?? SALE_BOUNDS.max}
                onChange={(mn, mx) => setDraft((p) => ({ ...p, saleMin: mn, saleMax: mx }))}
                formatValue={(v) => formatCompactQAR(v)}
              />
            </section>
          )}

          <section>
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Furnished</h3>
            <SegmentedControl
              options={[
                { label: "All", value: "ALL" },
                { label: "Furnished", value: "FURNISHED" },
                { label: "Unfurnished", value: "UNFURNISHED" },
              ]}
              value={draft.furnished}
              onChange={(v) => update("furnished", v)}
            />
          </section>

          <section>
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Bills</h3>
            <SegmentedControl
              options={[
                { label: "All", value: "ALL" },
                { label: "Included", value: "INCLUDED" },
                { label: "Excluded", value: "EXCLUDED" },
              ]}
              value={draft.bills}
              onChange={(v) => update("bills", v)}
            />
          </section>

          <section>
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Availability</h3>
            <ChipSelect options={AVAILABILITY_OPTIONS} value={draft.availability} onChange={(v) => update("availability", v)} />
          </section>

          <section>
            <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Agent</h3>
            <select
              value={draft.agentId ?? ""}
              onChange={(e) => update("agentId", e.target.value || null)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-primary appearance-none"
            >
              <option value="">All Agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </section>

          {isAdmin && (
            <section>
              <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-3">Status</h3>
              <SegmentedControl
                options={[
                  { label: "Active", value: "ACTIVE" },
                  { label: "Inactive", value: "INACTIVE" },
                  { label: "All", value: "ALL" },
                ]}
                value={draft.status}
                onChange={(v) => update("status", v)}
              />
            </section>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0 safe-bottom">
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_FILTERS)}
            className="flex-1 rounded-xl py-3.5 text-base font-semibold text-foreground bg-surface-muted active:opacity-70"
          >
            Clear Filters
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className="flex-1 rounded-xl py-3.5 text-base font-semibold text-white active:opacity-80"
            style={{ background: "var(--primary)" }}
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}
