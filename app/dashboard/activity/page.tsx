import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNowStrict } from 'date-fns'
import { Activity, MessageSquare, Target, TrendingUp } from 'lucide-react'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type ActivityItem = {
  type: 'comment' | 'objective_update' | 'keyresult_update'
  id: string
  user: { id: string; name: string; avatar: string | null }
  content: string
  target: { type: 'objective' | 'keyResult'; id: string; title: string } | null
  timestamp: Date
}

export default async function ActivityFeedPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const [comments, objectives, keyResults] = await Promise.all([
    prisma.comment.findMany({
      take: 50,
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        objective: { select: { id: true, title: true } },
        keyResult: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.objective.findMany({
      take: 20,
      where: { OR: [{ ownerId: session.user.id }, { status: 'ACTIVE' }] },
      include: { owner: { select: { id: true, name: true, avatar: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.keyResult.findMany({
      take: 20,
      where: { OR: [{ ownerId: session.user.id }, { status: 'ACTIVE' }] },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        objective: { select: { id: true, title: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  const activities: ActivityItem[] = [
    ...comments.map<ActivityItem>((c) => ({
      type: 'comment',
      id: c.id,
      user: c.author,
      content: c.content,
      target: c.objective
        ? { type: 'objective', id: c.objective.id, title: c.objective.title }
        : c.keyResult
        ? { type: 'keyResult', id: c.keyResult.id, title: c.keyResult.title }
        : null,
      timestamp: c.createdAt,
    })),
    ...objectives.map<ActivityItem>((o) => ({
      type: 'objective_update',
      id: o.id,
      user: o.owner,
      content: `Updated objective: ${o.title}`,
      target: { type: 'objective', id: o.id, title: o.title },
      timestamp: o.updatedAt,
    })),
    ...keyResults.map<ActivityItem>((kr) => ({
      type: 'keyresult_update',
      id: kr.id,
      user: kr.owner,
      content: `Updated key result: ${kr.title}`,
      target: { type: 'keyResult', id: kr.id, title: kr.title },
      timestamp: kr.updatedAt,
    })),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

  return (
    <div className="space-y-3">
      <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Audit trail</p>
          <h1 className="mt-1 text-[24px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>
            Activity
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Check-ins, edits, and comments across your workspace.
          </p>
        </div>
      </section>

      <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--ap-border)' }}>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Recent activity <span className="ml-1 font-mono normal-case text-muted-foreground">({activities.length})</span>
          </h2>
        </div>
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="flex size-10 items-center justify-center rounded-[10px]" style={{ background: 'var(--ap-bg-sunken)' }}>
              <Activity className="size-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-[13px] font-medium">Nothing yet</p>
            <p className="text-[12px] text-muted-foreground">Activity will appear as you and your team work on OKRs.</p>
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
            {activities.map((a) => {
              const Icon = a.type === 'comment' ? MessageSquare : a.type === 'objective_update' ? Target : TrendingUp
              const verb =
                a.type === 'comment' ? 'commented on' : a.type === 'objective_update' ? 'updated' : 'updated'
              const href = a.target
                ? a.target.type === 'objective'
                  ? `/dashboard/objectives/${a.target.id}`
                  : `/dashboard/key-results/${a.target.id}`
                : '#'
              return (
                <li key={`${a.type}-${a.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-[color:var(--ap-bg-hover)] transition">
                  <Avatar name={a.user.name} avatar={a.user.avatar} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] leading-snug">
                      <span className="font-semibold">{a.user.name}</span>{' '}
                      <span className="text-muted-foreground">{verb}</span>{' '}
                      {a.target && (
                        <Link href={href} className="font-medium hover:underline" style={{ color: 'var(--ap-accent)' }}>
                          {a.target.title}
                        </Link>
                      )}
                    </p>
                    {a.type === 'comment' && (
                      <p className="mt-1 text-[12px] text-muted-foreground line-clamp-2">{a.content}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                      <Icon className="size-3" />
                      <span className="capitalize">{a.type.replace(/_/g, ' ')}</span>
                      <span>·</span>
                      <span>{formatDistanceToNowStrict(a.timestamp, { addSuffix: true })}</span>
                    </div>
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

function Avatar({ name, avatar }: { name: string; avatar: string | null }) {
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt={name} className="size-8 rounded-full object-cover" />
  }
  const parts = name.trim().split(/\s+/)
  const letters = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0, 2) ?? '?'
  return (
    <span
      className="flex size-8 items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style={{ background: 'var(--ap-accent)' }}
    >
      {letters.toUpperCase()}
    </span>
  )
}
