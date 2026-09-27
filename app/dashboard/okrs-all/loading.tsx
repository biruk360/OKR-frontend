import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

export default function OkrsAllLoading() {
  return (
    <div className="space-y-4">
      <div
        className="space-y-2 rounded-[var(--ap-radius-md)] border bg-card px-5 pt-5 pb-4"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <Skeleton className="h-4 w-16 rounded-full" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-[var(--ap-radius-md)]" />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-72 rounded-[var(--ap-radius-sm)]" />
        <Skeleton className="h-9 w-24 rounded-[var(--ap-radius-sm)]" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  )
}
