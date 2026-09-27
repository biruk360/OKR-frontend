import { Skeleton, SkeletonCard, SkeletonChart } from '@/components/ui/Skeleton'

export default function InsightsLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading insights">
      <Skeleton className="h-28 w-full rounded-[var(--ap-radius-md)]" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonChart height={300} />
    </div>
  )
}
