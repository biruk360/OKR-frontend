import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ProgressReportWeeklyBars from './ProgressReportWeeklyBars'

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

  const offTrackObjectives = objectives
    .filter((o) => o.goalStatus === 'OFF_TRACK')
    .sort((a, b) => a.progress - b.progress)
    .slice(0, 20)
  const atRiskObjectives = objectives
    .filter((o) => o.goalStatus === 'AT_RISK')
    .sort((a, b) => a.progress - b.progress)
    .slice(0, 20)

  const offTrackKrs = keyResults
    .filter((k) => k.confidence === 'OFF_TRACK')
    .sort((a, b) => a.progress - b.progress)
    .slice(0, 20)
  const atRiskKrs = keyResults
    .filter((k) => k.confidence === 'AT_RISK')
    .sort((a, b) => a.progress - b.progress)
    .slice(0, 20)

  // Last 10 weeks: bucket ConfidenceSnapshot (if present) or fall back to
  // "current only" for the latest week.
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
  // Fill the latest week with the current counts if snapshots are absent.
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
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Progress Dashboard</h1>
          <p className="text-sm text-gray-500">Snapshot of where all active OKRs stand.</p>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SummaryCard
          title="Objectives"
          total={objectives.length}
          completed={objClosed}
          completionPct={objCompletionPct}
          onTrack={objOnTrack}
          atRisk={objAtRisk}
          offTrack={objOffTrack}
        />
        <SummaryCard
          title="Key results"
          total={keyResults.length}
          completed={keyResults.filter((k) => k.progress >= 100).length}
          completionPct={
            keyResults.length > 0
              ? (keyResults.filter((k) => k.progress >= 100).length / keyResults.length) * 100
              : 0
          }
          onTrack={krOnTrack}
          atRisk={krAtRisk}
          offTrack={krOffTrack}
        />
      </section>

      <section className="bg-white rounded-lg shadow p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Statuses over time</h2>
        <ProgressReportWeeklyBars objectives={objectiveWeekly} keyResults={keyResultWeekly} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StatusList
          title="OKRs off track"
          subtitle={`${offTrackObjectives.length} objectives · ${offTrackKrs.length} key results`}
          rows={[
            ...offTrackObjectives.map((o) => ({
              id: o.id,
              kind: 'OBJ' as const,
              title: o.title,
              owner: o.owner?.name ?? '—',
              href: `/dashboard/objectives/${o.id}`,
              progress: o.progress,
              status: 'OFF TRACK',
            })),
            ...offTrackKrs.map((k) => ({
              id: k.id,
              kind: 'KR' as const,
              title: k.title,
              owner: k.owner?.name ?? '—',
              href: `/dashboard/key-results/${k.id}`,
              progress: k.progress,
              status: 'OFF TRACK',
            })),
          ]}
        />
        <StatusList
          title="OKRs at risk"
          subtitle={`${atRiskObjectives.length} objectives · ${atRiskKrs.length} key results`}
          rows={[
            ...atRiskObjectives.map((o) => ({
              id: o.id,
              kind: 'OBJ' as const,
              title: o.title,
              owner: o.owner?.name ?? '—',
              href: `/dashboard/objectives/${o.id}`,
              progress: o.progress,
              status: 'AT RISK',
            })),
            ...atRiskKrs.map((k) => ({
              id: k.id,
              kind: 'KR' as const,
              title: k.title,
              owner: k.owner?.name ?? '—',
              href: `/dashboard/key-results/${k.id}`,
              progress: k.progress,
              status: 'AT RISK',
            })),
          ]}
        />
      </section>
    </div>
  )
}

function SummaryCard({
  title,
  total,
  completed,
  completionPct,
  onTrack,
  atRisk,
  offTrack,
}: {
  title: string
  total: number
  completed: number
  completionPct: number
  onTrack: number
  atRisk: number
  offTrack: number
}) {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-500">{Math.round(completionPct)}% complete</span>
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-3xl font-bold tabular-nums text-gray-900">{completed}</span>
        <span className="text-sm text-gray-500">/ {total}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-4">
        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, completionPct)}%` }} />
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Chip label="On track" value={onTrack} tint="bg-emerald-100 text-emerald-800" />
        <Chip label="At risk" value={atRisk} tint="bg-amber-100 text-amber-800" />
        <Chip label="Off track" value={offTrack} tint="bg-red-100 text-red-800" />
      </dl>
    </div>
  )
}

function Chip({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div className={`rounded-md px-2 py-1 text-xs font-medium ${tint}`}>
      <div className="font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
    </div>
  )
}

function StatusList({
  title,
  subtitle,
  rows,
}: {
  title: string
  subtitle: string
  rows: Array<{
    id: string
    kind: 'OBJ' | 'KR'
    title: string
    owner: string
    href: string
    progress: number
    status: string
  }>
}) {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-gray-500">Nothing here. Good news.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">OKR</th>
              <th className="px-4 py-2 w-20 text-right">Progress</th>
              <th className="px-4 py-2 w-28">Status</th>
              <th className="px-4 py-2 w-32">Owner</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.kind}-${r.id}`} className="border-t border-gray-100">
                <td className="px-4 py-2">
                  <Link href={r.href} className="text-gray-800 hover:text-blue-600 line-clamp-1">
                    <span className={`inline-block text-[10px] font-semibold mr-2 px-1.5 py-0.5 rounded ${r.kind === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>
                      {r.kind}
                    </span>
                    {r.title}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{Math.round(r.progress)}%</td>
                <td className="px-4 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${r.status === 'OFF TRACK' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-700 truncate">{r.owner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
