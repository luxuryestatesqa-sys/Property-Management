// Mirrors the compact horizontal PropertyCard (thumbnail + text lines) so the
// loading state doesn't visibly reflow once real listings arrive.
export default function PropertyCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-xl bg-surface border border-border shadow-sm p-2.5 animate-pulse">
      <div className="shrink-0 w-[95px] h-[85px] sm:w-[136px] sm:h-[108px] rounded-lg bg-surface-muted" />
      <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
        <div className="flex items-center justify-between gap-2">
          <div className="h-3 w-14 rounded bg-surface-muted" />
          <div className="h-3.5 w-16 rounded bg-surface-muted" />
        </div>
        <div className="h-3 w-3/4 rounded bg-surface-muted" />
        <div className="h-3 w-1/2 rounded bg-surface-muted" />
        <div className="h-3.5 w-2/3 rounded bg-surface-muted" />
        <div className="h-4 w-1/3 rounded bg-surface-muted" />
      </div>
    </div>
  );
}
