import { getServerSessionSafe } from '@/lib/auth'
import { redirect } from 'next/navigation'
import OkrHierarchyTable from './OkrHierarchyTable'

export const dynamic = 'force-dynamic'

export default async function OkrHierarchyPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">OKR Hierarchy</h1>
          <p className="text-sm text-muted-foreground">
            Tree view of objectives, key results, and initiatives with per-column filters.
          </p>
        </div>
      </header>
      <OkrHierarchyTable />
    </div>
  )
}
