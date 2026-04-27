import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ProgressReportWeeklyBars from './ProgressReportWeeklyBars'
import ProgressPagePrintButton from '../progress/ProgressPagePrintButton'

export const dynamic = 'force-dynamic'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function startOfIsoWeek(d: Date): Date {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = copy.getUTCDay() || 7
  copy.setUTCDate(copy.getUTCDate() - day + 1)
  return copy
}

export default async function ProgressReportPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const [objectives, keyResults] = await Promise.all([
    prisma.objective.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        title: true,
        progress: true,
        goalStatus: true,
        level: true,
        updatedAt: true,
        owner: { select: { id: true, name: true, avatar: true } },
      },
    }),
    prisma.keyResult.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        title: true,
        progress: true,
        confidence: true,
        updatedAt: true,
        description: true,
        owner: { select: { id: true, name: true, avatar: true } },
      },
    }),
  ])

  const objOnTrack = objectives.filter((o) => o.goalStatus === 'ON_TRACK').length
  const objAtRisk = objectives.filter((o) => o.goalStatus === 'AT_RISK').length
  const objOffTrack = objectives.filter((o) => o.goalStatus === 'OFF_TRACK').length
  const objClosed = objectives.filter((o) => o.goalStatus === 'CLOSED').length

  const krOnTrack = keyResults.filter((k) => k.confidence === 'ON_TRACK').length
  const krAtRisk = keyResults.filter((k) => k.confidence === 'AT_RISK').length
  const krOffTrack = keyResults.filter((k) => k.confidence === 'OFF_TRACK').length

  const objCompletionPct = objectives.length > 0 ? (objClosed / objectives.length) * 100 : 0

  const offTrackObjectives = objectives.filter((o) => o.goalStatus === 'OFF_TRACK').sort((a, b) => a.progress - b.progress).slice(0, 20)
  const atRiskObjectives = objectives.filter((o) => o.goalStatus === 'AT_RISK').sort((a, b) => a.progress - b.progress).slice(0, 20)
  const offTrackKrs = keyResults.filter((k) => k.confidence === 'OFF_TRACK').sort((a, b) => a.progress - b.progress).slice(0, 20)
  const atRiskKrs = keyResults.filter((k) => k.confidence === 'AT_RISK').sort((a, b) => a.progress - b.progress).slice(0, 20)

  const tenWeeksAgoIso = new Date(Date.now() - 10 * WEEK_MS).toISOString().slice(0, 10)
  const snapshots = await prisma.confidenceSnapshot.findMany({
    where: { periodStart: { gte: tenWeeksAgoIso } },
    orderBy: { periodStart: 'asc' },
    select: { periodStart: true, confidence: true, entityType: true },
  })

  const weeks: string[] = []
  for (let i = 9; i >= 0; i--) {
    const d = startOfIsoWeek(new Date(Date.now() - i * WEEK_MS))
    weeks.push(d.toISOString().slice(0, 10))
  }
  type Bucket = { on: number; at: number; off: number; total: number }
  const objBuckets = new Map<string, Bucket>()
  const krBuckets = new Map<string, Bucket>()
  for (const w of weeks) {
    objBuckets.set(w, { on: 0, at: 0, off: 0, total: 0 })
    krBuckets.set(w, { on: 0, at: 0, off: 0, total: 0 })
  }
  for (const s of snapshots) {
    const parsed = new Date(s.periodStart)
    if (Number.isNaN(parsed.getTime())) continue
    const key = startOfIsoWeek(parsed).toISOString().slice(0, 10)
    const bucket = s.entityType === 'OBJECTIVE' ? objBuckets.get(key) : krBuckets.get(key)
    if (!bucket) continue
    if (s.confidence === 'ON_TRACK') bucket.on++
    else if (s.confidence === 'AT_RISK') bucket.at++
    else if (s.confidence === 'OFF_TRACK') bucket.off++
    bucket.total++
  }
  const latest = weeks[weeks.length - 1]
  const latestObj = objBuckets.get(latest)!
  if (latestObj.total === 0) {
    latestObj.on = objOnTrack
    latestObj.at = objAtRisk
    latestObj.off = objOffTrack
    latestObj.total = objOnTrack + objAtRisk + objOffTrack
  }
  const latestKr = krBuckets.get(latest)!
  if (latestKr.total === 0) {
    latestKr.on = krOnTrack
    latestKr.at = krAtRisk
    latestKr.off = krOffTrack
    latestKr.total = krOnTrack + krAtRisk + krOffTrack
  }

  const objectiveWeekly = weeks.map((w) => ({ week: w.slice(5), ...objBuckets.get(w)! }))
  const keyResultWeekly = weeks.map((w) => ({ week: w.slice(5), ...krBuckets.get(w)! }))

  return (
    <div className="space-y-3">
      <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reports</p>
            <h1 className="mt-1 text-[24px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>
              Progress dashboard
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">Snapshot of where all active OKRs stand.</p>
          </div>
          <ProgressPagePrintButton />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SummaryCard title="Objectives" total={objectives.length} completed={objClosed}
          completionPct={objCompletionPct} onTrack={objOnTrack} atRisk={objAtRisk} offTrack={objOffTrack} />
        <SummaryCard title="Key results" total={keyResults.length}
          completed={keyResults.filter((k) => k.progress >= 100).length}
          completionPct={keyResults.length > 0 ? (keyResults.filter((k) => k.progress >= 100).length / keyResults.length) * 100 : 0}
          onTrack={krOnTrack} atRisk={krAtRisk} offTrack={krOffTrack} />
      </section>

      <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--ap-border)' }}>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Statuses over time</h2>
        </div>
        <div className="p-4">
          <ProgressReportWeeklyBars objectives={objectiveWeekly} keyResults={keyResultWeekly} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <StatusList title="OKRs off track"
          subtitle={`${offTrackObjectives.length} objectives · ${offTrackKrs.length} key results`}
          rows={[
            ...offTrackObjectives.map((o) => ({ id: o.id, kind: 'OBJ' as const, title: o.title, owner: o.owner?.name ?? '—', href: `/dashboard/objectives/${o.id}`, progress: o.progress, status: 'off-track' as const })),
            ...offTrackKrs.map((k) => ({ id: k.id, kind: 'KR' as const, title: k.title, owner: k.owner?.name ?? '—', href: `/dashboard/key-results/${k.id}`, progress: k.progress, status: 'off-track' as const })),
          ]} />
        <StatusList title="OKRs at risk"
          subtitle={`${atRiskObjectives.length} objectives · ${atRiskKrs.length} key results`}
          rows={[
            ...atRiskObjectives.map((o) => ({ id: o.id, kind: 'OBJ' as const, title: o.title, owner: o.owner?.name ?? '—', href: `/dashboard/objectives/${o.id}`, progress: o.progress, status: 'at-risk' as const })),
            ...atRiskKrs.map((k) => ({ id: k.id, kind: 'KR' as const, title: k.title, owner: k.owner?.name ?? '—', href: `/dashboard/key-results/${k.id}`, progress: k.progress, status: 'at-risk' as const })),
          ]} />
      </section>
    </div>
  )
}

function SummaryCard({
  title, total, completed, completionPct, onTrack, atRisk, offTrack,
}: { title: string; total: number; completed: number; completionPct: number; onTrack: number; atRisk: number; offTrack: number }) {
  return (
    <div className="rounded-[14px] border bg-card px-5 py-5" style={{ borderColor: 'var(--ap-border)' }}>
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <span className="text-[11px] tabular-nums text-muted-foreground">{Math.round(completionPct)}% complete</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[28px] font-semibold tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>{completed}</span>
        <span className="text-[13px] text-muted-foreground">/ {total}</span>
      </div>
      <div className="mt-3 h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--ap-kr-bar-bg)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, completionPct)}%`, background: 'var(--ap-green)' }} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2">
        <Chip label="On track" value={onTrack} bg="rgba(52,199,89,0.12)" fg="var(--ap-green)" />
        <Chip label="At risk" value={atRisk} bg="rgba(255,149,0,0.12)" fg="var(--ap-orange)" />
        <Chip label="Off track" value={offTrack} bg="rgba(255,59,48,0.12)" fg="var(--ap-red)" />
      </dl>
    </div>
  )
}

function Chip({ label, value, bg, fg }: { label: string; value: number; bg: string; fg: string }) {
  return (
    <div className="rounded-[10px] px-2 py-2 text-center" style={{ background: bg, color: fg }}>
      <div className="text-[16px] font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-90">{label}</div>
    </div>
  )
}

function StatusList({
  title, subtitle, rows,
}: {
  title: string; subtitle: string;
  rows: Array<{ id: string; kind: 'OBJ' | 'KR'; title: string; owner: string; href: string; progress: number; status: 'off-track' | 'at-risk' }>
}) {
  return (
    <div className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
      <div className="border-b px-4 py-3" style={{ borderColor: 'var(--ap-border)' }}>
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">Nothing here. Good news.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
          {rows.map((r) => {
            const color = r.status === 'off-track' ? 'var(--ap-red)' : 'var(--ap-orange)'
            return (
              <li key={`${r.kind}-${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[color:var(--ap-bg-hover)] transition">
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    background: r.kind === 'KR' ? 'var(--ap-accent-soft)' : 'rgba(88,86,214,0.12)',
                    color: r.kind === 'KR' ? 'var(--ap-accent)' : 'rgb(88,86,214)',
                  }}
                >
                  {r.kind}
                </span>
                <Link href={r.href} className="flex-1 min-w-0 text-[13px] truncate hover:underline">
                  {r.title}
                </Link>
                <span className="text-[12px] font-mono tabular-nums w-10 text-right" style={{ color }}>
                  {Math.round(r.progress)}%
                </span>
                <span className="hidden sm:inline text-[11px] text-muted-foreground truncate w-24 text-right">{r.owner}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
