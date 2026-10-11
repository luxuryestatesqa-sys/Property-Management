import Link from "next/link";
import type { ReactNode } from "react";

export const LEGAL = {
  company: "OneLinker",
  product: "OneLinker CRM",
  email: "onelinkerr@gmail.com",
  updated: "11 October 2026",
};

// The plain, public layout of the policy pages: readable on a phone, no sign-in, no app menu.
export default function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 lg:py-16">
      <nav className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-muted">
        <Link href="/login" className="font-medium text-foreground hover:underline">
          {LEGAL.product}
        </Link>
        <Link href="/privacy" className="hover:text-foreground hover:underline">
          Privacy Policy
        </Link>
        <Link href="/terms" className="hover:text-foreground hover:underline">
          Terms of Service
        </Link>
        <Link href="/data-deletion" className="hover:text-foreground hover:underline">
          Data deletion
        </Link>
      </nav>
      <h1 className="text-[30px] font-semibold tracking-[-0.02em] lg:text-[36px]">{title}</h1>
      <p className="mt-2 text-[13.5px] text-muted">Last updated {LEGAL.updated}</p>
      <p className="mt-6 text-[15.5px] leading-relaxed text-foreground/85">{intro}</p>
      <div className="mt-8 flex flex-col gap-8">{children}</div>
      <p className="mt-14 border-t border-border pt-6 text-[13.5px] text-muted">
        Questions about this page? Email{" "}
        <a href={`mailto:${LEGAL.email}`} className="font-medium text-foreground underline">
          {LEGAL.email}
        </a>
        .
      </p>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-foreground/85">{children}</div>
    </section>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="ml-5 list-disc space-y-1.5">
      {items.map((i, n) => (
        <li key={n}>{i}</li>
      ))}
    </ul>
  );
}
