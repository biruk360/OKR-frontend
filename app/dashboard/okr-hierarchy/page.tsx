import { getServerSessionSafe } from '@/lib/auth'
import { redirect } from 'next/navigation'
import OkrHierarchyTable from './OkrHierarchyTable'

export const dynamic = 'force-dynamic'

export default async function OkrHierarchyPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div
        className="rounded-[14px] border bg-card px-5 pt-5 pb-4"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-2">
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}
              >
                Hierarchy
              </span>
            </div>
            <h1
              className="text-[24px] font-semibold leading-tight"
              style={{ letterSpacing: '-0.02em' }}
            >
              OKR Hierarchy
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground" style={{ maxWidth: 720 }}>
              Tree view of objectives, key results, and initiatives. Use the per-column filters
              to slice by timeframe, owner, status, or label.
            </p>
          </div>
        </div>
      </div>

      <OkrHierarchyTable />
    </div>
  )
}
