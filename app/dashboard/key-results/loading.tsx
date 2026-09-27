import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

export default function KeyResultsLoading() {
  return (
    <div className="space-y-4 p-5" aria-busy="true" aria-label="Loading key results">
      <Skeleton className="h-8 w-48" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-32" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  )
}
