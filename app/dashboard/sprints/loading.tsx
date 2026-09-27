import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

export default function SprintsLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading sprints">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-10 w-full rounded-card" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  )
}
