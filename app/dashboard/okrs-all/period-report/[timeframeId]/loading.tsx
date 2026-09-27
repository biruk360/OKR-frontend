import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'

/** Own boundary so the report doesn't inherit the OKR Explorer list skeleton from ../../loading.tsx. */
export default function PeriodCloseReportLoading() {
  return (
    <div className="space-y-4 p-5">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-4 w-1/2" />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )
}
