import { Skeleton, SkeletonAvatar, SkeletonCard, SkeletonRow } from '@/components/ui/Skeleton'

export default function OrgTeamLoading() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]" aria-busy="true" aria-label="Loading team">
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-6 flex flex-col items-center gap-3">
          <SkeletonAvatar size={80} />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
        <SkeletonCard />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  )
}
