import type { ReactNode } from "react";

function Check() {
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,0.16)" }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

function Logo({ dark }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-9 w-9 items-center justify-center rounded-xl"
        style={dark ? { background: "var(--gradient-primary)" } : { background: "rgba(255,255,255,0.16)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 10.5L12 3l9 7.5" />
          <path d="M5 9.5V20h14V9.5" />
          <path d="M10 20v-6h4v6" />
        </svg>
      </span>
      <span className={`text-[17px] font-semibold tracking-tight ${dark ? "" : "text-white"}`} style={dark ? { color: "var(--primary-dark)" } : undefined}>
        Listings Portal
      </span>
    </div>
  );
}

/** Split-screen layout shared by login and signup: brand panel on the left (desktop), form card on the right. */
export default function AuthShell({
  headline,
  points,
  footnote,
  wide,
  children,
}: {
  headline: string;
  points: string[];
  footnote: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden text-white lg:flex flex-col justify-between p-14 xl:p-16" style={{ background: "var(--gradient-primary)" }}>
        {/* decorative rings */}
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full" style={{ border: "1px solid rgba(255,255,255,0.12)" }} />
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 h-[260px] w-[260px] rounded-full" style={{ border: "1px solid rgba(255,255,255,0.10)" }} />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-24 h-[460px] w-[460px] rounded-full" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.10), transparent 70%)" }} />

        <div className="relative"><Logo /></div>

        <div className="relative max-w-lg">
          <h2 className="text-[40px] font-bold leading-[1.12] tracking-tight text-white">{headline}</h2>
          <ul className="mt-8 flex flex-col gap-4">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-[16px] leading-snug" style={{ color: "rgba(255,255,255,0.86)" }}>
                <Check />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[13px]" style={{ color: "rgba(255,255,255,0.62)" }}>{footnote}</p>
      </aside>

      <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="mb-8 lg:hidden"><Logo dark /></div>
        <div
          className={`w-full ${wide ? "max-w-[560px]" : "max-w-[440px]"} rounded-3xl p-6 sm:p-8`}
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "0 24px 60px rgba(13,31,92,0.10)" }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
