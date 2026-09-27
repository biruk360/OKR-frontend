import { Skeleton, SkeletonCard, SkeletonChart, SkeletonRow } from '@/components/ui/Skeleton'

export default function ObjectiveDetailLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading objective">
      {/* Top bar: back link + actions */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-36" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-[var(--ap-radius-sm)]" />
          <Skeleton className="h-8 w-8 rounded-[var(--ap-radius-sm)]" />
          <Skeleton className="h-8 w-8 rounded-[var(--ap-radius-sm)]" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Left: hero + KR list */}
        <div className="min-w-0 space-y-4">
          <div
            className="rounded-[var(--ap-radius-card)] border bg-[var(--ap-bg-raised)] p-5"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="mt-4 h-7 w-2/3" />
            <Skeleton className="mt-3 h-4 w-1/2" />
            <div className="mt-5 grid grid-cols-3 gap-3">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          </div>

          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-3">
          <SkeletonChart height={180} />
          <SkeletonCard />
        </div>
      </div>
    </div>
  )
}
