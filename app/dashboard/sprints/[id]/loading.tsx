import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'

/** Board-shaped skeleton — matches SprintBoardClient's own loading state (STA-1). */
export default function SprintBoardLoading() {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading sprint">
      <SkeletonCard className="h-[132px]" />
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2].map((lane) => (
          <div
            key={lane}
            className="flex w-[272px] shrink-0 flex-col gap-2 rounded-[12px] border p-2"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: 3 - lane }).map((_, card) => (
              <Skeleton key={card} className="h-[84px] w-full rounded-[8px]" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
