// Mirrors the property detail page's real layout (gallery, price card, info
// cards) so the loading state doesn't visibly reflow once real data arrives.
export default function PropertyDetailSkeleton() {
  return (
    <div className="px-4 pb-10 animate-pulse">
      <div className="sticky top-0 z-20 bg-background safe-top pt-4 pb-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-surface-muted shrink-0" />
        <div className="h-5 w-40 rounded bg-surface-muted" />
      </div>

      <div className="flex flex-col gap-4">
        <div className="-mx-4 px-4">
          <div className="w-full aspect-[4/3] rounded-2xl bg-surface-muted" />
        </div>

        <div className="rounded-2xl bg-surface-muted h-32" />

        <div className="flex gap-2.5">
          <div className="flex-1 h-11 rounded-lg bg-surface-muted" />
          <div className="flex-1 h-11 rounded-lg bg-surface-muted" />
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="h-3 w-24 rounded bg-surface-muted mb-3" />
          <div className="flex flex-col gap-2.5">
            <div className="h-3.5 w-full rounded bg-surface-muted" />
            <div className="h-3.5 w-5/6 rounded bg-surface-muted" />
            <div className="h-3.5 w-2/3 rounded bg-surface-muted" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="h-3 w-32 rounded bg-surface-muted mb-3" />
          <div className="flex flex-col gap-2.5">
            <div className="h-3.5 w-full rounded bg-surface-muted" />
            <div className="h-3.5 w-4/6 rounded bg-surface-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
