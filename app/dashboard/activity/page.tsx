import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNowStrict } from 'date-fns'
import { Activity, CheckCircle2, MessageSquare, Target, TrendingUp } from 'lucide-react'
import { getServerSessionSafe } from '@/lib/auth'
import EmptyState from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { loadActivityFeedPage } from '@/lib/okr/activity-feed.server'

const ACTION_LABEL: Record<string, string> = {
  CREATED: 'created',
  UPDATED: 'updated',
  STATUS_CHANGED: 'changed the status of',
  PROGRESS_UPDATED: 'updated progress on',
  CHECKIN: 'checked in on',
  CHECKIN_REQUESTED: 'requested a check-in on',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
  UNARCHIVED: 'restored',
  DELETED: 'deleted',
  COMMENTED: 'commented on',
  INITIATIVE_ADDED: 'added an initiative to',
  INITIATIVE_UPDATED: 'updated an initiative on',
  INITIATIVE_REMOVED: 'removed an initiative from',
  RISK_REPORTED: 'reported a risk on',
  RISK_UPDATED: 'updated a risk on',
  RISK_RESOLVED: 'resolved a risk on',
  CLOSURE_INITIATED: 'started closing',
  CLOSED: 'closed',
  REOPENED: 'reopened',
  ROLLED_FORWARD: 'rolled forward',
}

function verbFor(action: string): string {
  return ACTION_LABEL[action] ?? action.toLowerCase().replace(/_/g, ' ')
}

function iconFor(action: string, isKeyResult: boolean) {
  if (action === 'COMMENTED') return MessageSquare
  if (action === 'CHECKIN' || action === 'PROGRESS_UPDATED') return TrendingUp
  if (action === 'COMPLETED' || action === 'CLOSED') return CheckCircle2
  return isKeyResult ? TrendingUp : Target
}

interface PageProps {
  searchParams?: { before?: string }
}

/**
 * Workspace OKR activity — real `ActivityLog` rows (previously this page
 * fabricated "Updated …" entries from `updatedAt`). Scoping, pagination and
 * comment bodies are loaded by lib/okr/activity-feed.server.ts.
 */
export default async function ActivityFeedPage({ searchParams }: PageProps) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { before, page, commentById, nextBefore } = await loadActivityFeedPage(session.user, searchParams?.before)

  return (
    <div className="space-y-3">
      <section className="rounded-[var(--ap-radius-md)] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="px-5 py-5">
          <PageHeader
            className="mb-0"
            breadcrumb={<Eyebrow>Audit trail</Eyebrow>}
            title="Activity"
            description="Check-ins, edits, and comments on the OKRs you can see."
          />
        </div>
      </section>

      <section className="rounded-[var(--ap-radius-md)] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--ap-border)' }}>
          <h2 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            {before ? 'Older activity' : 'Recent activity'}{' '}
            <span className="ml-1 font-mono normal-case text-muted-foreground">({page.length})</span>
          </h2>
          {before && (
            <Link href="/dashboard/activity" className="text-xs hover:underline" style={{ color: 'var(--ap-accent)' }}>
              Back to latest
            </Link>
          )}
        </div>
        {page.length === 0 ? (
          <EmptyState
            bare
            icon={<Activity className="size-5" />}
            title="Nothing yet"
            description="Activity will appear as you and your team work on OKRs."
          />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
            {page.map((log) => {
              const isKeyResult = Boolean(log.keyResult)
              const target = log.keyResult
                ? { href: `/dashboard/key-results/${log.keyResult.id}`, title: log.keyResult.title }
                : log.objective
                  ? { href: `/dashboard/objectives/${log.objective.id}`, title: log.objective.title }
                  : null
              const Icon = iconFor(log.action, isKeyResult)
              const commentId = (log.metadata as Record<string, unknown> | null)?.commentId
              const comment = typeof commentId === 'string' ? commentById.get(commentId) : undefined
              const actorName = log.actor?.name ?? 'Someone'
              return (
                <li key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-[color:var(--ap-bg-hover)] transition">
                  <Avatar name={actorName} avatar={log.actor?.avatar ?? null} />
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm leading-snug">
                      <span className="font-semibold">{actorName}</span>{' '}
                      <span className="text-muted-foreground">{verbFor(log.action)}</span>{' '}
                      {target && (
                        <Link href={target.href} className="font-medium hover:underline" style={{ color: 'var(--ap-accent)' }}>
                          {target.title}
                        </Link>
                      )}
                    </p>
                    {comment && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{comment}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-caption text-muted-foreground tabular-nums">
                      <Icon className="size-3" />
                      <span>{isKeyResult ? 'Key result' : 'Objective'}</span>
                      <span>·</span>
                      <time dateTime={log.createdAt.toISOString()}>
                        {formatDistanceToNowStrict(log.createdAt, { addSuffix: true })}
                      </time>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {nextBefore && (
          <div className="border-t px-4 py-3 text-center" style={{ borderColor: 'var(--ap-border)' }}>
            <Link
              href={`/dashboard/activity?before=${encodeURIComponent(nextBefore)}`}
              className="text-xs font-medium hover:underline"
              style={{ color: 'var(--ap-accent)' }}
            >
              Load older activity
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}

function Avatar({ name, avatar }: { name: string; avatar: string | null }) {
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt={name} className="size-8 rounded-full object-cover" />
  }
  const parts = name.trim().split(/\s+/)
  const letters = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0, 2) ?? '?'
  return (
    <span
      className="flex size-8 items-center justify-center rounded-full text-caption font-semibold"
      style={{ background: 'var(--ap-accent)', color: 'var(--ap-accent-fg)' }}
    >
      {letters.toUpperCase()}
    </span>
  )
}
