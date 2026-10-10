"use client";

import { useEffect, useState } from "react";
import { Filters, DEFAULT_FILTERS } from "@/lib/filters";
import { formatCompactQAR } from "@/lib/format";
import { AVAILABILITY_LABELS } from "@/lib/availability";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_LABELS } from "@/lib/propertyCategory";
import { IconClose } from "./icons";

interface Chip {
  key: string;
  label: string;
  clear: (f: Filters) => Filters;
}

function range(min: number | null, max: number | null) {
  if (min !== null && max !== null) return `${formatCompactQAR(min)} – ${formatCompactQAR(max)}`;
  if (min !== null) return `from ${formatCompactQAR(min)}`;
  return `up to ${formatCompactQAR(max ?? 0)}`;
}

// Removable summary of every filter that's currently narrowing the list, so
// agents can see (and undo) exactly why results are hidden without reopening
// the filter panel. Listing type is left out - it has its own toggle.
export default function FilterChips({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!filters.agentId || agentNames[filters.agentId]) return;
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, string> = {};
        for (const a of d.agents ?? []) map[a.id] = a.name;
        setAgentNames(map);
      })
      .catch(() => {});
  }, [filters.agentId, agentNames]);

  const chips: Chip[] = [];
  if (filters.propertyCategory) chips.push({ key: "cat", label: PROPERTY_CATEGORY_LABELS[filters.propertyCategory], clear: (f) => ({ ...f, propertyCategory: null }) });
  if (filters.bedrooms) chips.push({ key: "bed", label: BEDROOM_LABELS[filters.bedrooms], clear: (f) => ({ ...f, bedrooms: null }) });
  if (filters.area) chips.push({ key: "area", label: filters.area, clear: (f) => ({ ...f, area: null, community: null, building: null }) });
  if (filters.community) chips.push({ key: "com", label: filters.community, clear: (f) => ({ ...f, community: null, building: null }) });
  if (filters.building) chips.push({ key: "bld", label: filters.building, clear: (f) => ({ ...f, building: null }) });
  if (filters.rentMin !== null || filters.rentMax !== null) chips.push({ key: "rent", label: `Rent ${range(filters.rentMin, filters.rentMax)}`, clear: (f) => ({ ...f, rentMin: null, rentMax: null }) });
  if (filters.saleMin !== null || filters.saleMax !== null) chips.push({ key: "sale", label: `Price ${range(filters.saleMin, filters.saleMax)}`, clear: (f) => ({ ...f, saleMin: null, saleMax: null }) });
  if (filters.furnished !== "ALL") chips.push({ key: "furn", label: filters.furnished === "FURNISHED" ? "Furnished" : "Unfurnished", clear: (f) => ({ ...f, furnished: "ALL" }) });
  if (filters.bills !== "ALL") chips.push({ key: "bills", label: `Bills ${filters.bills === "INCLUDED" ? "included" : "excluded"}`, clear: (f) => ({ ...f, bills: "ALL" }) });
  if (filters.availability !== "ALL") chips.push({ key: "av", label: AVAILABILITY_LABELS[filters.availability], clear: (f) => ({ ...f, availability: "ALL" }) });
  if (filters.agentId) chips.push({ key: "agent", label: `Agent: ${agentNames[filters.agentId] ?? "…"}`, clear: (f) => ({ ...f, agentId: null }) });
  if (filters.status !== DEFAULT_FILTERS.status) chips.push({ key: "status", label: filters.status === "ALL" ? "Active + inactive" : "Inactive only", clear: (f) => ({ ...f, status: DEFAULT_FILTERS.status }) });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.clear(filters))}
          className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-1.5 pl-3 pr-2 text-[12.5px] font-medium text-foreground shadow-sm transition-colors hover:border-danger/40 hover:bg-danger-bg"
          aria-label={`Remove filter ${c.label}`}
        >
          {c.label}
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface-muted text-muted transition-colors group-hover:bg-danger group-hover:text-white">
            <IconClose size={10} strokeWidth={2.6} />
          </span>
        </button>
      ))}
      <button type="button" onClick={() => onChange(DEFAULT_FILTERS)} className="px-1 text-[12.5px] font-semibold hover:underline" style={{ color: "var(--primary)" }}>
        Clear all
      </button>
    </div>
  );
}
