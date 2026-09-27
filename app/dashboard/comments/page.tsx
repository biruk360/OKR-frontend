import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNowStrict } from 'date-fns'
import { MessageSquare } from 'lucide-react'
import { getServerSessionSafe } from '@/lib/auth'
import { loadCommentsPage } from '@/lib/okr/comments-page.server'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Eyebrow } from '@/components/ui/Eyebrow'

export default async function CommentsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { comments, thisWeek, activeUsers } = await loadCommentsPage(session.user)

  return (
    <div className="space-y-3">
      <section className="rounded-[var(--ap-radius-md)] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="px-5 py-5">
          <PageHeader
            className="mb-0"
            breadcrumb={<Eyebrow>Conversations</Eyebrow>}
            title="Comments"
            description="Discussions across objectives and key results."
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total" value={comments.length} />
        <Stat label="This week" value={thisWeek} />
        <Stat label="Active authors" value={activeUsers} />
      </div>

      <section className="rounded-[var(--ap-radius-md)] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--ap-border)' }}>
          <h2 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            Recent comments <span className="ml-1 font-mono normal-case text-muted-foreground">({comments.length})</span>
          </h2>
        </div>
        {comments.length === 0 ? (
          <EmptyState
            bare
            icon={<MessageSquare className="size-5 text-muted-foreground" />}
            title="No comments yet"
            description="Discussions on OKRs will appear here."
          />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
            {comments.map((c) => {
              const targetHref = c.objective
                ? `/dashboard/objectives/${c.objective.id}`
                : c.keyResult
                ? `/dashboard/key-results/${c.keyResult.id}`
                : '#'
              const targetLabel = c.objective ? c.objective.title : c.keyResult?.title ?? ''
              const targetType = c.objective ? 'Objective' : 'Key result'
              return (
                <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                  <Avatar name={c.author.name} avatar={c.author.avatar} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p className="text-body-sm font-semibold truncate">{c.author.name}</p>
                      <span className="text-caption tabular-nums text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(c.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="mt-1 text-body-sm leading-snug whitespace-pre-wrap">{c.content}</p>
                    {targetLabel && (
                      <p className="mt-1.5 text-caption text-muted-foreground">
                        <span className="uppercase tracking-wide">{targetType}</span>{' · '}
                        <Link href={targetHref} className="font-medium hover:underline" style={{ color: 'var(--ap-accent)' }}>
                          {targetLabel}
                        </Link>
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--ap-radius-md)] border bg-card px-4 py-4" style={{ borderColor: 'var(--ap-border)' }}>
      <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>
        {value}
      </p>
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
