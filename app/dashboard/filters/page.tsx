import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { FiltersWorkspace } from '@/features/filters'

export const dynamic = 'force-dynamic'

export default async function FiltersPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FiltersWorkspace />
    </div>
  )
}
