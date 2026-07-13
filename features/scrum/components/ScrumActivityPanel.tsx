import Link from 'next/link'
import { AlertTriangle, CalendarDays, ChevronRight, Sparkles } from 'lucide-react'
import { prisma } from '@/lib/prisma'

interface ScrumActivityPanelProps {
  title?: string
  objectiveId?: string
  keyResultId?: string
  projectId?: string
  projectActivityId?: string
  compact?: boolean
}

export async function ScrumActivityPanel({
  title = 'Daily Scrum activity',
  objectiveId,
  keyResultId,
  projectId,
  projectActivityId,
  compact = false,
}: ScrumActivityPanelProps) {
  const linkFilters = [
    objectiveId ? { links: { some: { objectiveId } } } : null,
    keyResultId ? { links: { some: { keyResultId } } } : null,
  ].filter(Boolean) as Array<Record<string, unknown>>

  const directFilters = [
    projectId ? { projectId } : null,
    projectActivityId ? { projectActivityId } : null,
  ].filter(Boolean) as Array<Record<string, unknown>>

  const filters = [...linkFilters, ...directFilters]
  if (filters.length === 0) return null

  const updates = await prisma.scrumUpdate.findMany({
    where: { OR: filters },
    orderBy: [{ scrumDate: 'desc' }, { submittedAt: 'desc' }],
    take: compact ? 3 : 6,
    select: {
      id: true,
      userId: true,
      scrumDate: true,
      todayPlan: true,
      blockers: true,
      wins: true,
      hasBlocker: true,
      hasWin: true,
      blockerStatus: true,
      isProxyEntry: true,
      links: { select: { id: true, context: true, linkType: true, progressNote: true } },
    },
  })
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(new Set(updates.map((update) => update.userId))) } },
    select: { id: true, name: true },
  })
  const userNameById = new Map(users.map((user) => [user.id, user.name]))

  return (
    <section className="rounded-lg border bg-card" style={{ borderColor: 'var(--ap-border)' }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--ap-border)' }}>
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarDays className="size-4 text-muted-foreground" />
          {title}
        </h3>
        <Link href="/dashboard/scrum" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          Open <ChevronRight className="size-3" />
        </Link>
      </div>
      {updates.length === 0 ? (
        <div className="px-4 py-6 text-sm text-muted-foreground">
          No Daily Scrum updates linked here yet.
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
          {updates.map((update) => (
            <li key={update.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{userNameById.get(update.userId) ?? 'Team member'}</span>
                    <span>·</span>
                    <span>{update.scrumDate.toISOString().slice(0, 10)}</span>
                    {update.isProxyEntry && <span className="rounded-full bg-muted px-1.5 py-0.5">Proxy</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-foreground">{stripHtml(update.todayPlan || 'No plan recorded')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {update.hasBlocker && <AlertTriangle className="size-4 text-amber-600" />}
                  {update.hasWin && <Sparkles className="size-4 text-emerald-600" />}
                </div>
              </div>
              {(update.blockers || update.wins) && (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {update.blockers && <p className="line-clamp-1">Blocker: {stripHtml(update.blockers)}</p>}
                  {update.wins && <p className="line-clamp-1">Win: {stripHtml(update.wins)}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
