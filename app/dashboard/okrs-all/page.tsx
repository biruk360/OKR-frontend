import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import OkrsAllClient from './OkrsAllClient'

/**
 * OKR Explorer — consolidated view merging Plans / Company OKRs / Department
 * OKRs / Objectives. The four source pages stay in place; this is additive.
 */
export const dynamic = 'force-dynamic'

export default async function OkrsAllPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">OKR Explorer</h1>
          <p className="text-sm text-muted-foreground">
            One place for all objectives, key results, and initiatives — with live KPIs,
            per-column filters, tabs, and a role-aware create menu.
          </p>
        </div>
      </header>
      <OkrsAllClient
        currentUser={{
          id: session.user.id,
          role: session.user.role as 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE',
        }}
      />
    </div>
  )
}
