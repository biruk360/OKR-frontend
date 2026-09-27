'use client'

import Link from 'next/link'
import { ArrowLeft, PartyPopper, Trophy, UserRound } from 'lucide-react'
import { Button, EmptyState, PageHeader } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import RichTextContent from '@/components/shared/RichTextContent'
import { useCelebrateScrumWin, useScrumWins } from '../hooks/queries'
import { scrumDateKeyOf } from '../services/view-state'

export interface ScrumWinsPageProps {
  currentUserId?: string
}

export function ScrumWinsPage({ currentUserId }: ScrumWinsPageProps = {}) {
  const wins = useScrumWins()
  const celebrate = useCelebrateScrumWin()
  return (
    <div className="mx-auto max-w-content px-6 py-6">
      <Link href="/dashboard/scrum" className="mb-3 inline-flex items-center gap-1 text-body-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="size-4" /> Daily Scrum
      </Link>
      <PageHeader title="Scrum Wins" description="Recent wins across teams." />
      {wins.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2" aria-busy="true" aria-label="Loading wins">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-card bg-surface-card p-4 shadow-card">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : (wins.data ?? []).length === 0 ? (
        <EmptyState icon={Trophy} title="No wins yet" description="Wins logged in daily scrum will appear here." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(wins.data ?? []).map((update: any) => {
            const dateKey = scrumDateKeyOf(update.scrumDate)
            const authorName = update.author?.name ?? 'Team member'
            const isOwn = !!currentUserId && update.userId === currentUserId
            const count = update.celebrations?.length ?? 0
            return (
              <article key={update.id} className="rounded-card border border-warning-500/30 bg-warning-50 p-4 shadow-card">
                <header className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-body-sm font-medium">
                    {update.author?.avatar ? <img src={update.author.avatar} alt="" className="size-5 rounded-full" /> : <UserRound className="size-4" aria-hidden="true" />}
                    {authorName}
                  </span>
                  <span className="text-body-sm text-ink-secondary">{dateKey}</span>
                </header>
                {update.wins && <RichTextContent html={update.wins} className="text-body text-ink-primary [&_p]:my-0" />}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={update.celebratedByMe ? 'secondary' : 'outline'}
                    size="sm"
                    disabled={isOwn || update.celebratedByMe || celebrate.isPending}
                    onClick={() => celebrate.mutate(update.id)}
                    aria-label={update.celebratedByMe ? 'You celebrated this win' : `Celebrate ${authorName}'s win`}
                  >
                    <PartyPopper className="mr-1.5 size-4" aria-hidden="true" />
                    {update.celebratedByMe ? 'Celebrated' : 'Celebrate'}
                    <span className="ml-1 tabular-nums">{count}</span>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/dashboard/scrum?update=${update.id}&date=${dateKey}`}>Open update</Link>
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
