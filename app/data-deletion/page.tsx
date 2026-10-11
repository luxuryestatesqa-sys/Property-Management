import type { Metadata } from "next";

export const metadata: Metadata = { title: "Data deletion", robots: { index: false } };

// The page Meta shows a person after they ask Facebook to delete the data this app holds about them.
export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <h1 className="text-[24px] font-semibold tracking-tight">Your data has been deleted</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">The Facebook connection details this app held about you have been removed, and your Pages will no longer send leads here.</p>
      {code && (
        <p className="mt-6 text-[13px] text-muted">
          Confirmation code: <span className="font-mono text-foreground">{code}</span>
        </p>
      )}
    </div>
  );
}
