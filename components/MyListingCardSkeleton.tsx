// Mirrors MyListingCard's compact header plus its availability/action rows,
// so the loading state doesn't reflow once real listings arrive.
export default function MyListingCardSkeleton() {
  return (
    <div className="rounded-xl bg-surface border border-border shadow-sm p-2.5 animate-pulse">
      <div className="flex gap-3">
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
      <div className="mt-2.5 pt-2.5 border-t border-border h-8 rounded bg-surface-muted" />
      <div className="flex gap-2 mt-2.5 pt-2.5 border-t border-border">
        <div className="flex-1 h-9 rounded-lg bg-surface-muted" />
        <div className="flex-1 h-9 rounded-lg bg-surface-muted" />
      </div>
    </div>
  );
}
