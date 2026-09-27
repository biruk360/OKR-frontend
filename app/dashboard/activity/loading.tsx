import { Skeleton, SkeletonAvatar } from '@/components/ui/Skeleton'

export default function ActivityLoading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading activity">
      <div className="rounded-[var(--ap-radius-md)] border bg-card px-5 py-5 space-y-2" style={{ borderColor: 'var(--ap-border)' }}>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="rounded-[var(--ap-radius-md)] border bg-card divide-y" style={{ borderColor: 'var(--ap-border)' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3">
            <SkeletonAvatar size={32} />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
