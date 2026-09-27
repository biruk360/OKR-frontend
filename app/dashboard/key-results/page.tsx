import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { FiltersWorkspace } from '@/features/filters'

export const dynamic = 'force-dynamic'

/**
 * Key results index. Thin composition over the Filters workspace, opened on the
 * Key Results tab with the viewer's own KRs ("Owned" segment); every other KR
 * segment and filter is one click away. Linked from the command palette.
 */
export default async function KeyResultsIndexPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  // FiltersWorkspace reads its state from the URL; default to "my key results".
  if (!searchParams.tab && !searchParams.segment) {
    redirect('/dashboard/key-results?tab=key-results&segment=kr-owned')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FiltersWorkspace />
    </div>
  )
}
