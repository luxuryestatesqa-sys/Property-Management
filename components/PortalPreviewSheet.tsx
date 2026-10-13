"use client";

import { useEffect, useState } from "react";
import { formatQAR } from "@/lib/format";
import type { PortalPreview } from "@/app/api/listings/[id]/preview/route";

// A look at one listing as a portal will receive it, before it is published there. Loads the same data
// the portal's feed would carry, so what is shown here is what goes out.
export default function PortalPreviewSheet({ listingId, portal, label, onClose }: { listingId: number; portal: PortalPreview["portal"]; label: string; onClose: () => void }) {
  const [data, setData] = useState<PortalPreview | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"look" | "data">("look");
  const [photo, setPhoto] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/listings/${listingId}/preview?portal=${portal}`);
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) setError(typeof body?.error === "string" ? body.error : "Couldn't load the preview");
        else setData(body);
      } catch {
        if (!cancelled) setError("Couldn't load the preview");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId, portal]);

  const c = data?.card;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end lg:items-center lg:justify-center" role="dialog" aria-label={`${label} preview`}>
      <div className="absolute inset-0 bg-[rgba(13,31,92,0.4)] backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative mx-auto flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-background lg:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 pb-3 pt-4">
          <div>
            <h2 className="text-lg font-semibold">Preview · {label}</h2>
            <p className="text-[11px] text-muted">Built from the data {label} will receive</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close preview" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-muted">
            ✕
          </button>
        </div>

        <div className="flex shrink-0 gap-1 border-b border-border px-3 pt-2">
          {([["look", "How it looks"], ["data", "Data sent"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px flex-1 border-b-2 px-2 pb-2.5 pt-1.5 text-[14px] ${tab === k ? "border-primary font-medium text-primary" : "border-transparent text-slate-500"}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="no-scrollbar overflow-y-auto">
          {error && <div className="m-4 rounded-xl bg-danger-bg px-4 py-3 text-[13.5px] text-danger">{error}</div>}
          {!error && !data && <div className="m-4 h-64 animate-pulse rounded-2xl bg-surface-muted" />}

          {data && c && (
            <>
              {data.problems.length > 0 ? (
                <div className="mx-4 mt-4 rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
                  <div className="font-semibold">Needed before this can be published</div>
                  <ul className="mt-1 list-disc pl-5">
                    {data.problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="mx-4 mt-4 rounded-xl bg-success-bg px-4 py-2.5 text-[13px] font-medium" style={{ color: "var(--success)" }}>
                  ✓ Ready to publish
                </div>
              )}

              {tab === "look" && (
                <div className="p-4">
                  <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
                    <div className="relative aspect-[4/3] bg-surface-muted">
                      {c.photos.length > 0 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.photos[photo]} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-4xl text-border">🏠</div>
                      )}
                      {c.photos.length > 1 && (
                        <span className="absolute bottom-2 right-2 rounded-full bg-[rgba(13,31,92,0.6)] px-2.5 py-1 text-[11px] font-medium text-white">
                          {photo + 1} / {c.photos.length}
                        </span>
                      )}
                    </div>
                    {c.photos.length > 1 && (
                      <div className="no-scrollbar flex gap-1.5 overflow-x-auto p-2">
                        {c.photos.map((u, i) => (
                          <button key={u} type="button" onClick={() => setPhoto(i)} className={`h-12 w-16 shrink-0 overflow-hidden rounded-md ring-2 ${i === photo ? "ring-primary" : "ring-transparent"}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={u} alt="" className="h-full w-full object-cover" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="p-4">
                      <div className="text-[20px] font-bold">
                        {formatQAR(c.price)}
                        {c.perMonth && <span className="text-[13px] font-medium text-muted"> / month</span>}
                      </div>
                      <h3 className="mt-1 text-[16px] font-semibold leading-snug">{c.title}</h3>
                      <p className="mt-1 text-[13px] text-muted">📍 {c.location}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {c.facts.map((f) => (
                          <span key={f} className="rounded-full bg-surface-muted px-2.5 py-1 text-[12px] text-slate-600">
                            {f}
                          </span>
                        ))}
                      </div>
                      <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-slate-700">{c.description}</p>
                      {c.amenities.length > 0 && (
                        <div className="mt-3">
                          <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">Amenities</div>
                          <div className="flex flex-wrap gap-1.5">
                            {c.amenities.map((a) => (
                              <span key={a} className="rounded-full bg-accent-light px-2.5 py-1 text-[12px] text-primary">
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {c.agent && (
                        <div className="mt-4 border-t border-border pt-3 text-[13px]">
                          <div className="font-medium">{c.agent.name}</div>
                          <div className="text-muted">{[c.agent.phone, c.agent.email].filter(Boolean).join(" · ")}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {tab === "data" && (
                <div className="p-4">
                  <pre className="max-h-[60vh] overflow-auto rounded-xl bg-slate-900 p-3.5 text-[11.5px] leading-relaxed text-slate-100">{data.payload}</pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
