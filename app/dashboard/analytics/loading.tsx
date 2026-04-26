import { Skeleton, SkeletonCard, SkeletonChart } from '@/components/ui/Skeleton'

export default function AnalyticsLoading() {
  return (
    <div className="space-y-4 p-5">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonChart height={300} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonChart height={240} />
        <SkeletonChart height={240} />
      </div>
    </div>
  )
}
