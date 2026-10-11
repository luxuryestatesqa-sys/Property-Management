"use client";

import { formatQAR } from "@/lib/format";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS } from "@/lib/propertyCategory";
import { PropertyCategory, BedroomCount, ListingType } from "@/lib/types";
import { TypePill } from "./Badges";
import { IconCheck, IconImage, IconPin } from "./icons";

export interface AddAsideData {
  listingType: ListingType;
  propertyCategory: PropertyCategory | "";
  bedrooms: string;
  sizeSqm: string;
  price: string;
  cover: string | null;
  photoCount: number;
  area: string;
  community: string;
  buildingName: string;
  checklist: { label: string; done: boolean; target?: string }[];
  // good to have but not required to save; shown below the required list
  recommended?: { label: string; done: boolean; target?: string }[];
}

// Sticky desktop sidebar on the Add Property page: a live preview of the
// listing as it's typed, what is still missing, and the submit button, so the
// agent never has to scroll to the bottom of a long form to save.
export default function AddPropertyAside({ data, submitting, error, onSubmit, hideSubmit, onJump }: { data: AddAsideData; submitting: boolean; error: string; onSubmit: () => void; hideSubmit?: boolean; onJump?: (id: string) => void }) {
  const done = data.checklist.filter((c) => c.done).length;
  const total = data.checklist.length;
  const pct = Math.round((done / total) * 100);
  const specs = [
    data.propertyCategory ? PROPERTY_CATEGORY_LABELS[data.propertyCategory] : null,
    data.bedrooms ? BEDROOM_SHORT_LABELS[data.bedrooms as BedroomCount] : null,
    data.sizeSqm ? `${data.sizeSqm} sqm` : null,
  ].filter(Boolean);

  return (
    <aside className="sticky top-6 flex flex-col gap-5">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="relative aspect-[16/10] bg-surface-muted">
          {data.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-[13px] text-muted">
              <IconImage size={28} />
              Cover photo preview
            </div>
          )}
          <div className="absolute left-3 top-3">
            <TypePill type={data.listingType} solid />
          </div>
          {data.photoCount > 0 && <div className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">{data.photoCount} photo{data.photoCount === 1 ? "" : "s"}</div>}
        </div>
        <div className="p-4">
          <div className="text-[22px] font-bold tracking-tight">
            {data.price ? formatQAR(Number(data.price)) : <span className="text-muted/60">QAR —</span>}
            {data.listingType === "RENT" && <span className="ml-1 text-[13px] font-medium text-muted">/ month</span>}
          </div>
          <div className="mt-1 truncate text-[15px] font-semibold">{data.buildingName || <span className="font-normal text-muted/60">Building name</span>}</div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-muted">
            <IconPin size={13} className="shrink-0" />
            {data.area || data.community ? `${data.area || "…"} → ${data.community || "…"}` : "Location"}
          </div>
          {specs.length > 0 && <div className="mt-2 text-[13px] text-foreground/80">{specs.join(" · ")}</div>}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">Ready to add?</h3>
          <span className="text-[12.5px] font-semibold" style={{ color: pct === 100 ? "var(--success)" : "var(--muted)" }}>
            {done}/{total}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: pct === 100 ? "var(--success)" : "var(--accent)" }} />
        </div>
        <ul className="mt-4 flex flex-col gap-2.5">
          {data.checklist.map((c) => (
            <li key={c.label}>
              <button
                type="button"
                disabled={!onJump || !c.target || c.done}
                onClick={() => c.target && onJump?.(c.target)}
                className="flex w-full items-center gap-2.5 text-left text-[13.5px] enabled:hover:text-slate-900"
                style={{ color: c.done ? "var(--foreground)" : "var(--muted)" }}
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={c.done ? { background: "var(--success)", color: "#fff" } : { border: "1.5px solid var(--border)" }}
                >
                  {c.done && <IconCheck size={12} strokeWidth={3} />}
                </span>
                {c.label}
              </button>
            </li>
          ))}
        </ul>

        {data.recommended && data.recommended.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">Recommended</div>
            <ul className="flex flex-col gap-2.5">
              {data.recommended.map((c) => (
                <li key={c.label}>
                  <button
                    type="button"
                    disabled={!onJump || !c.target || c.done}
                    onClick={() => c.target && onJump?.(c.target)}
                    className="flex w-full items-center gap-2.5 text-left text-[13.5px] enabled:hover:text-slate-900"
                    style={{ color: c.done ? "var(--foreground)" : "var(--muted)" }}
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={c.done ? { background: "var(--success)", color: "#fff" } : { border: "1.5px dashed #d6a528" }}
                    >
                      {c.done && <IconCheck size={12} strokeWidth={3} />}
                    </span>
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <div className="mt-4 rounded-xl bg-danger-bg px-3.5 py-3 text-[13px] text-danger">{error}</div>}

        {!hideSubmit && <button
          type="button"
          disabled={submitting}
          onClick={onSubmit}
          className="mt-5 w-full rounded-xl py-3.5 text-[15px] font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: "var(--primary)" }}
        >
          {submitting ? "Adding..." : "Add Property"}
        </button>}
      </div>
    </aside>
  );
}
