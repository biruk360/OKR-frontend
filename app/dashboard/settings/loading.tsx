import { Skeleton } from '@/components/ui/Skeleton'

/** Settings pages render inside the settings layout (nav stays put); this fills the content column. */
export default function SettingsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading settings">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div
        className="space-y-3 rounded-[var(--ap-radius-md)] border bg-card p-5"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <Skeleton className="h-9 w-full max-w-sm" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}
