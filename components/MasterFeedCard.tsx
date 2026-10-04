"use client";

import { useEffect, useState } from "react";
import PortalFeedCard from "./PortalFeedCard";

interface Report {
  included: number;
  skipped: { id: number; title: string; reasons: string[] }[];
  textWarnings: { id: number; title: string; issues: string[] }[];
}

// Admin view of the master XML feed for every portal except Property Finder:
// the shared feed-link card plus a live count of what's in it and why any
// listing an agent switched on was left out.
export default function MasterFeedCard() {
  const [report, setReport] = useState<Report | null>(null);
  const [copiedNote, setCopiedNote] = useState(false);

  useEffect(() => {
    fetch("/api/admin/feeds/master")
      .then((r) => (r.ok ? r.json() : null))
      .then(setReport)
      .catch(() => setReport(null));
  }, []);

  async function copyInstructions() {
    try {
      const res = await fetch("/api/admin/portals/OTHER_PORTALS");
      const cred = res.ok ? await res.json() : null;
      if (!cred?.feedAgencyId || !cred?.feedToken) {
        window.alert("Set an agency ID and generate a token on the Master Feed card first.");
        return;
      }
      const url = `${window.location.origin}/feeds/all.xml?agency=${encodeURIComponent(cred.feedAgencyId)}&token=${cred.feedToken}`;
      const note = [
        "Luxury Estates - listings XML feed",
        `Feed URL: ${url}`,
        "Format: XML, UTF-8. Poll as often as you like; the server answers 304 when nothing changed (send If-None-Match).",
        "Optional filters: &type=rent or &type=sale, &updated_since=<ISO-8601 timestamp>.",
        "Each listing has a stable <reference> (never reused) and lists its own photos and agent contact.",
      ].join("\n");
      await navigator.clipboard.writeText(note);
      setCopiedNote(true);
      setTimeout(() => setCopiedNote(false), 1800);
    } catch {
      // Clipboard can be denied - nothing useful to surface.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <PortalFeedCard portal="OTHER_PORTALS" slug="all.xml" label="Master (Other Portals)" />
      <section className="rounded-2xl border border-border bg-surface p-4 text-[14px]">
        <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide mb-2">Master Feed Contents</h3>
        {!report ? (
          <div className="h-8 rounded-xl bg-surface-muted animate-pulse" />
        ) : (
          <>
            <div className="flex justify-between">
              <span className="text-muted">Listings in the feed</span>
              <span className="font-semibold">{report.included}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted">Switched on but skipped</span>
              <span className="font-semibold">{report.skipped.length}</span>
            </div>
            {report.skipped.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5 text-[12px]">
                {report.skipped.map((s) => (
                  <li key={s.id} className="rounded-lg bg-surface-muted px-3 py-2">
                    <a href={`/property/${s.id}`} className="font-semibold underline">
                      {s.title}
                    </a>
                    <span className="text-muted"> - {s.reasons.join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
            {report.textWarnings?.length > 0 && (
              <>
                <div className="mt-3 text-[13px] font-semibold">Title / description needs a look</div>
                <ul className="mt-1.5 flex flex-col gap-1.5 text-[12px]">
                  {report.textWarnings.map((w) => (
                    <li key={w.id} className="rounded-lg bg-surface-muted px-3 py-2">
                      <a href={`/property/${w.id}`} className="font-semibold underline">
                        {w.title}
                      </a>
                      <span className="text-muted"> - {w.issues.join("; ")}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
        <button
          type="button"
          onClick={copyInstructions}
          className="mt-3 text-[12px] font-semibold px-3 py-2 rounded-lg bg-surface-muted active:opacity-70"
        >
          {copiedNote ? "Copied" : "Other portal - copy feed details"}
        </button>
      </section>
    </div>
  );
}
