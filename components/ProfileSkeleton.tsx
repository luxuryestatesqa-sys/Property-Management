// Mirrors the profile page's real layout (avatar, info card, action
// buttons) so the loading state doesn't visibly reflow once /api/me
// resolves - the avatar photo itself is the slowest part (a full-size data
// URL fetched over the network), so it gets its own placeholder circle
// instead of popping in blank.
export default function ProfileSkeleton() {
  return (
    <div className="px-4 pb-10 animate-pulse">
      <div className="safe-top pt-4 pb-3">
        <h1 className="text-xl font-bold">Profile</h1>
      </div>

      <div className="flex flex-col items-center py-6">
        <div className="w-20 h-20 rounded-full bg-surface-muted mb-3" />
        <div className="h-5 w-32 rounded bg-surface-muted" />
        <div className="h-5 w-20 rounded-lg bg-surface-muted mt-2" />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="h-3.5 w-24 rounded bg-surface-muted" />
          <div className="h-3.5 w-28 rounded bg-surface-muted" />
        </div>
        <div className="flex justify-between items-center">
          <div className="h-3.5 w-28 rounded bg-surface-muted" />
          <div className="h-3.5 w-24 rounded bg-surface-muted" />
        </div>
        <div className="flex justify-between items-center">
          <div className="h-3.5 w-14 rounded bg-surface-muted" />
          <div className="h-3.5 w-36 rounded bg-surface-muted" />
        </div>
        <div className="flex justify-between items-center">
          <div className="h-3.5 w-24 rounded bg-surface-muted" />
          <div className="h-3.5 w-14 rounded bg-surface-muted" />
        </div>
      </div>

      <div className="flex flex-col gap-3 mt-5">
        <div className="h-[52px] rounded-xl bg-surface-muted" />
        <div className="h-[52px] rounded-xl bg-surface-muted" />
      </div>
    </div>
  );
}
