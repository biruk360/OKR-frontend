import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'

export default function SprintReportLoading() {
  return (
    <div className="mx-auto max-w-[860px] space-y-4 px-4 py-6" aria-busy="true" aria-label="Loading sprint report">
      <Skeleton className="h-4 w-20" />
      <SkeletonCard />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
