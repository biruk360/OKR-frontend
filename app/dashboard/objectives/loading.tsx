import { Skeleton, SkeletonRow } from '@/components/ui/Skeleton'

export default function ObjectivesLoading() {
  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-9 w-32 rounded-[10px]" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  )
}
