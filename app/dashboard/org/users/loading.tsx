import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'

export default function OrgUsersLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading users">
      <Skeleton className="h-4 w-64 max-w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}
