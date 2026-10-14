"use client";

import { memo, useEffect, useState } from "react";
import Link from "next/link";
import { ListingDTO } from "@/lib/types";
import { formatQAR, formatSqm, listingCode } from "@/lib/format";
import { PROPERTY_CATEGORY_LABELS, BEDROOM_SHORT_LABELS, unitSummary } from "@/lib/propertyCategory";
import { buildListingInquiryMessage } from "@/lib/whatsapp";
import Avatar from "../Avatar";
import WhatsAppButton from "../WhatsAppButton";
import { useOrg } from "../OrgProvider";
import { AvailabilityPill, TypePill } from "./Badges";
import { IconBed, IconBuilding, IconChevronRight, IconClose, IconImage, IconPin, IconRuler } from "./icons";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Qatar", day: "numeric", month: "short", year: "numeric" });

// A property that several agents have listed. On the list it looks exactly like
// any other property card (same cover photo, price and details) with a
// "Duplicate" tag on top. Opening it shows each copy and which agent it belongs to.
function DuplicateGroupCardDesktop({ group, compact = false }: { group: ListingDTO[]; compact?: boolean }) {
  const org = useOrg();
  const [open, setOpen] = useState(false);
  const first = group[0];
  const cover = group.map((l) => l.images[0]).find(Boolean);
  const unitText = unitSummary(first);

  const prices = group.map((l) => (l.listingType === "RENT" ? l.rentPrice : l.salePrice)).filter((p): p is number => typeof p === "number");
  const minPrice = prices.length ? Math.min(...prices) : null;
  const priceVaries = prices.length > 1 && Math.max(...prices) !== Math.min(...prices);
  const allRent = group.every((l) => l.listingType === "RENT");

  const agents = Array.from(new Map(group.map((l) => [l.createdBy.id, l.createdBy])).values());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card-cv-compact group flex w-full flex-col overflow-hidden rounded-[20px] bg-surface text-left shadow-[var(--shadow-card)] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)]"
      >
        <div className={`relative w-full overflow-hidden bg-surface-muted ${compact ? "aspect-[4/3]" : "aspect-[16/10] wide:aspect-[16/11]"}`}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.url} alt={first.buildingName} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted/50">
              <IconImage size={40} />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/[0.06]" />

          <div className="absolute left-3 top-3 flex max-w-[calc(100%-6.5rem)] flex-wrap items-center gap-1.5">
            {allRent || group.every((l) => l.listingType === "SALE") ? <TypePill type={first.listingType} solid /> : null}
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-bold leading-none text-warning shadow-sm">Duplicate · {group.length}</span>
          </div>
          <div className="absolute right-3 top-3 rounded-full bg-[rgba(13,31,92,0.55)] px-2.5 py-1 text-[11px] font-medium leading-none text-white backdrop-blur-sm">{listingCode(first.id)}</div>

          <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2 text-white">
            <div className="tnum text-[22px] font-semibold leading-none tracking-tight drop-shadow">
              {priceVaries && <span className="mr-1 text-[13px] font-medium opacity-90">From </span>}
              {formatQAR(minPrice)}
              {allRent && <span className="ml-1 text-[13px] font-medium opacity-90">/mo</span>}
            </div>
            <AvailabilityPill status={first.availabilityStatus} />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="min-w-0">
            <h3 className="truncate text-[16px] font-semibold leading-snug text-foreground">
              {first.buildingName}
              {unitText && <span className="font-normal text-muted"> · {unitText}</span>}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 truncate text-[13px] text-muted">
              <IconPin size={14} className="shrink-0" />
              <span className="truncate">
                {first.area} <span className="opacity-60">→</span> {first.community}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-foreground/80">
            <span className="inline-flex items-center gap-1.5">
              <IconBuilding size={15} className="text-muted" />
              {PROPERTY_CATEGORY_LABELS[first.propertyCategory]}
            </span>
            {first.bedrooms && (
              <span className="inline-flex items-center gap-1.5">
                <IconBed size={15} className="text-muted" />
                {BEDROOM_SHORT_LABELS[first.bedrooms]}
              </span>
            )}
            {first.sizeSqm && (
              <span className="inline-flex items-center gap-1.5">
                <IconRuler size={15} className="text-muted" />
                {formatSqm(first.sizeSqm)}
              </span>
            )}
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex -space-x-2">
                {agents.slice(0, 3).map((a) => (
                  <span key={a.id} className="rounded-full ring-2 ring-white">
                    <Avatar name={a.name} avatarUrl={a.avatarUrl} size={24} neutral />
                  </span>
                ))}
              </div>
              <span className="truncate text-[12.5px] font-medium text-foreground/80">
                {agents[0].name}
                {agents.length > 1 && ` +${agents.length - 1}`}
              </span>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-slate-500 transition-colors group-hover:text-slate-900">
              View agents
              <IconChevronRight size={14} />
            </span>
          </div>
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="Agents listing this property">
          <div className="absolute inset-0 bg-[rgba(13,31,92,0.4)] backdrop-blur-[2px] backdrop-blur-[3px]" onClick={() => setOpen(false)} />
          <div className="page-in relative flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-hidden rounded-3xl bg-white shadow-[0_28px_80px_-16px_rgba(16,24,40,0.5),0_0_0_1px_rgba(16,24,40,0.06)]">
            <div className="flex items-start gap-4 border-b border-slate-100 p-5">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
                {cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover.url} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold leading-none text-amber-800">Listed by {agents.length} agent{agents.length === 1 ? "" : "s"}</span>
                <h2 className="mt-2 truncate text-[18px] font-semibold tracking-tight">
                  {first.buildingName}
                  {unitText && <span className="font-normal text-muted"> · {unitText}</span>}
                </h2>
                <p className="mt-0.5 truncate text-[13px] text-muted">
                  {first.area} → {first.community}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
                <IconClose size={18} />
              </button>
            </div>

            <div className="overflow-y-auto p-3">
              <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Who this property belongs to</p>
              {group.map((l) => {
                const isRent = l.listingType === "RENT";
                return (
                  <div key={l.id} className="group/row flex items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-slate-50">
                    <Avatar name={l.createdBy.name} avatarUrl={l.createdBy.avatarUrl} size={44} neutral />
                    <Link href={`/property/${l.id}`} className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold">{l.createdBy.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-muted">
                        <TypePill type={l.listingType} />
                        <span className="tnum font-semibold text-foreground">{isRent ? `${formatQAR(l.rentPrice)}/mo` : formatQAR(l.salePrice)}</span>
                        <span>{shortDate(l.createdAt)}</span>
                        <span>{listingCode(l.id)}</span>
                      </div>
                    </Link>
                    <WhatsAppButton number={l.createdBy.whatsapp} message={buildListingInquiryMessage(l, org.name)} size={34} />
                    <Link href={`/property/${l.id}`} aria-label={`Open ${listingCode(l.id)}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors group-hover/row:bg-white group-hover/row:text-slate-900">
                      <IconChevronRight size={17} />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default memo(DuplicateGroupCardDesktop);
