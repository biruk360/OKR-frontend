import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import StatusPill, { normalizeStatus } from '@/components/shared/StatusPill'
import ProgressPagePrintButton from './ProgressPagePrintButton'

export default async function ProgressTrackingPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  let objectives: any[] = []

  if (session.user.role === 'EMPLOYEE') {
    objectives = await prisma.objective.findMany({
      where: { ownerId: session.user.id, status: 'ACTIVE' },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        keyResults: { include: { todos: true } },
        timeframe: true,
      },
      orderBy: { updatedAt: 'desc' },
    })
  } else if (session.user.role === 'DEPARTMENT_LEAD') {
    const userDepartments = await prisma.departmentMembership.findMany({
      where: { userId: session.user.id },
      select: { departmentId: true },
    })
    const departmentIds = userDepartments.map((d) => d.departmentId)
    objectives = await prisma.objective.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ ownerId: session.user.id }, { departmentId: { in: departmentIds } }],
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        keyResults: { include: { todos: true } },
        timeframe: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })
  } else {
    objectives = await prisma.objective.findMany({
      where: { status: 'ACTIVE' },
      include: {
        keyResults: { include: { todos: true } },
        timeframe: true,
        department: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })
  }

  const onTrack = objectives.filter((o) => o.progress >= 75).length
  const atRisk = objectives.filter((o) => o.progress >= 25 && o.progress < 75).length
  const offTrack = objectives.filter((o) => o.progress < 25).length
  const avgProgress =
    objectives.length > 0
      ? Math.round(objectives.reduce((s, o) => s + o.progress, 0) / objectives.length)
      : 0

  return (
    <div className="space-y-3">
      <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tracking</p>
            <h1 className="mt-1 text-[24px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>
              Progress
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Monitor progress across all your objectives and key results.
            </p>
          </div>
          <ProgressPagePrintButton />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="On track" value={onTrack} color="var(--ap-green)" />
        <Kpi label="At risk" value={atRisk} color="var(--ap-orange)" />
        <Kpi label="Off track" value={offTrack} color="var(--ap-red)" />
        <Kpi label="Average progress" value={`${avgProgress}%`} />
      </div>

      <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--ap-border)' }}>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Objectives <span className="ml-1 font-mono normal-case text-muted-foreground">({objectives.length})</span>
          </h2>
        </div>
        {objectives.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">No active objectives.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
            {objectives.map((o) => {
              const color = o.progress >= 75 ? 'var(--ap-green)' : o.progress >= 25 ? 'var(--ap-orange)' : 'var(--ap-red)'
              return (
                <li key={o.id} className="px-4 py-3 hover:bg-[color:var(--ap-bg-hover)] transition">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/dashboard/objectives/${o.id}`}
                      className="flex-1 min-w-0 text-[13px] font-medium hover:underline truncate"
                    >
                      {o.title}
                    </Link>
                    <StatusPill status={normalizeStatus(o.goalStatus)} />
                    <span className="text-[12px] font-mono tabular-nums text-muted-foreground w-10 text-right">
                      {Math.round(o.progress)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--ap-kr-bar-bg)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, o.progress)}%`, background: color }} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{o.owner?.name ?? 'Unowned'}</span>
                    <span>·</span>
                    <span>{o.keyResults.length} KRs</span>
                    <span>·</span>
                    <span>{o.timeframe.name}</span>
                    {o.department && (<><span>·</span><span>{o.department.name}</span></>)}
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

function Kpi({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-[14px] border bg-card px-4 py-4" style={{ borderColor: 'var(--ap-border)' }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className="mt-1.5 text-[28px] font-semibold tabular-nums leading-none"
        style={{ letterSpacing: '-0.02em', color: color ?? 'var(--ap-fg)' }}
      >
        {value}
      </p>
    </div>
  )
}
