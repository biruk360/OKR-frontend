import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

/** Decisions page skeleton; `bare` skips the header (used as the client Suspense fallback). */
export function DecisionsSkeleton({ bare = false }: { bare?: boolean }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading decisions">
      {!bare && (
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-[var(--ap-radius-md)]" />
        ))}
      </div>
      <div className="space-y-3 rounded-card border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] p-4">
        <Skeleton className="h-5 w-32" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 min-w-[200px] flex-1 rounded-[var(--ap-radius-sm)]" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-[var(--ap-radius-sm)]" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  )
}
