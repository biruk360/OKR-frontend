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
      <div
        className="rounded-[14px] border bg-card px-5 pt-5 pb-4"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}
          >
            Explorer
          </span>
        </div>
        <h1
          className="text-[24px] font-semibold leading-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          OKR Explorer
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground" style={{ maxWidth: 720 }}>
          One place for all objectives, key results, and initiatives — with live KPIs,
          per-column filters, tabs, and a role-aware create menu.
        </p>
      </div>
      <OkrsAllClient
        currentUser={{
          id: session.user.id,
          role: session.user.role as 'ADMIN' | 'EXECUTIVE' | 'DEPARTMENT_LEAD' | 'EMPLOYEE',
        }}
      />
    </div>
  )
}
