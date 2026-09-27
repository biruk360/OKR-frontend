import { Skeleton, SkeletonCard, SkeletonRow } from '@/components/ui/Skeleton'

export default function PerformanceLoading() {
  return (
    <div className="space-y-4">
      <div className="mb-6">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  )
}
