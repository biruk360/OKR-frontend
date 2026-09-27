import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

export default function AutomationsLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading automations">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
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
