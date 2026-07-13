'use client'

import Link from 'next/link'
import { ArrowLeft, Trophy } from 'lucide-react'
import { Button, EmptyState, PageHeader } from '@/components/ui'
import { useScrumWins } from '../hooks/queries'

export function ScrumWinsPage() {
  const wins = useScrumWins()
  return (
    <div className="mx-auto max-w-content px-6 py-6">
      <Link href="/dashboard/scrum" className="mb-3 inline-flex items-center gap-1 text-body-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="size-4" /> Daily Scrum
      </Link>
      <PageHeader title="Scrum Wins" description="Recent wins across teams." />
      {wins.isLoading ? (
        <div className="rounded-card bg-surface-card p-8 shadow-card"><EmptyState bare title="Loading wins" /></div>
      ) : (wins.data ?? []).length === 0 ? (
        <EmptyState icon={Trophy} title="No wins yet" description="Wins logged in daily scrum will appear here." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(wins.data ?? []).map((update: any) => (
            <div key={update.id} className="rounded-card border border-warning-500/30 bg-warning-50 p-4 shadow-card">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-body-sm font-medium">{update.scrumDate?.slice?.(0, 10) ?? ''}</span>
                <span className="text-body-sm text-warning-700">{update.celebrations?.length ?? 0} celebrates</span>
              </div>
              <div className="text-body text-ink-primary" dangerouslySetInnerHTML={{ __html: update.wins }} />
              <Button asChild variant="outline" size="sm" className="mt-3"><Link href={`/dashboard/scrum?update=${update.id}`}>Open update</Link></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
