import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNowStrict } from 'date-fns'
import { MessageSquare } from 'lucide-react'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function CommentsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  let comments: any[] = []

  if (session.user.role === 'EMPLOYEE') {
    const userObjectives = await prisma.objective.findMany({
      where: { ownerId: session.user.id },
      select: { id: true },
    })
    const objectiveIds = userObjectives.map((o) => o.id)

    const userKeyResults = await prisma.keyResult.findMany({
      where: { ownerId: session.user.id },
      select: { id: true },
    })
    const keyResultIds = userKeyResults.map((kr) => kr.id)

    comments = await prisma.comment.findMany({
      where: {
        OR: [
          { objectiveId: { in: objectiveIds } },
          { keyResultId: { in: keyResultIds } },
        ],
      },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        objective: { select: { id: true, title: true } },
        keyResult: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  } else {
    comments = await prisma.comment.findMany({
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        objective: { select: { id: true, title: true } },
        keyResult: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  }

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const thisWeek = comments.filter((c) => new Date(c.createdAt) > weekAgo).length
  const activeUsers = new Set(comments.map((c) => c.authorId)).size

  return (
    <div className="space-y-3">
      <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conversations</p>
          <h1 className="mt-1 text-[24px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>
            Comments
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Discussions across objectives and key results.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total" value={comments.length} />
        <Stat label="This week" value={thisWeek} />
        <Stat label="Active authors" value={activeUsers} />
      </div>

      <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--ap-border)' }}>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Recent comments <span className="ml-1 font-mono normal-case text-muted-foreground">({comments.length})</span>
          </h2>
        </div>
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="flex size-10 items-center justify-center rounded-[10px]" style={{ background: 'var(--ap-bg-sunken)' }}>
              <MessageSquare className="size-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-[13px] font-medium">No comments yet</p>
            <p className="text-[12px] text-muted-foreground">Discussions on OKRs will appear here.</p>
          </div>
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
                      <p className="text-[13px] font-semibold truncate">{c.author.name}</p>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(c.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] leading-snug whitespace-pre-wrap">{c.content}</p>
                    {targetLabel && (
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
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
    <div className="rounded-[14px] border bg-card px-4 py-4" style={{ borderColor: 'var(--ap-border)' }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-[24px] font-semibold tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>
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
      className="flex size-8 items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style={{ background: 'var(--ap-accent)' }}
    >
      {letters.toUpperCase()}
    </span>
  )
}
