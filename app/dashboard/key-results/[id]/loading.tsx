import { Skeleton, SkeletonCard, SkeletonChart, SkeletonRow } from '@/components/ui/Skeleton'

export default function KeyResultDetailLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 pt-4" aria-busy="true" aria-label="Loading key result">
      {/* Breadcrumb / action bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <Skeleton className="h-6 w-72" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main column */}
        <div className="min-w-0 space-y-3">
          {/* Hero */}
          <div className="space-y-3 rounded-[var(--ap-radius-md)] border border-border bg-card p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          </div>
          {/* Check-in history */}
          <div className="space-y-2 rounded-[var(--ap-radius-md)] border border-border bg-card p-5">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
          <SkeletonCard />
        </div>

        {/* Right rail */}
        <aside className="space-y-3">
          <SkeletonChart height={200} />
          <SkeletonCard />
        </aside>
      </div>
    </div>
  )
}
