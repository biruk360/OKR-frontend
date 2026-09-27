import { Skeleton } from '@/components/ui/Skeleton'

export default function WorkBoardLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading work board">
      <Skeleton className="h-7 w-40" />
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2, 3].map((lane) => (
          <div
            key={lane}
            className="flex w-[272px] shrink-0 flex-col gap-2 rounded-[12px] border p-2"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: 3 }).map((_, card) => (
              <Skeleton key={card} className="h-[72px] w-full rounded-[8px]" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
