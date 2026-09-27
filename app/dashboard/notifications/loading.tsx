import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

export default function NotificationsLoading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading notifications">
      <div className="rounded-[var(--ap-radius-md)] border bg-card px-5 py-5 space-y-2" style={{ borderColor: 'var(--ap-border)' }}>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-11 w-full rounded-[var(--ap-radius-md)]" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  )
}
