'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Download, LockKeyhole } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import OkrCloseModal from '@/components/shared/OkrCloseModal'
import type { buildPeriodCloseReport } from '@/lib/okr/period-report'

type Report = NonNullable<Awaited<ReturnType<typeof buildPeriodCloseReport>>>
const CHART_COLORS = ['var(--ap-green)', 'var(--ap-blue)', 'var(--ap-orange)', 'var(--ap-red)']

export default function PeriodCloseReportClient({ report }: { report: Report }) {
  const router = useRouter()
  const [queueIndex, setQueueIndex] = useState<number | null>(null)
  const queueEntity = queueIndex == null ? null : report.closeQueue[queueIndex]

  const advanceQueue = () => {
    if (queueIndex == null) return
    const next = queueIndex + 1
    setQueueIndex(next < report.closeQueue.length ? next : null)
    router.refresh()
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/okrs-all" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> All OKRs</Link>
          <h1 className="mt-3 text-page-title text-foreground">{report.timeframe.name} Period Close</h1>
          <p className="mt-1 text-body-sm text-muted-foreground">{new Date(report.timeframe.startDate).toLocaleDateString()} – {new Date(report.timeframe.endDate).toLocaleDateString()} · {report.scope.type === 'DEPARTMENT' ? 'Department scope' : 'Organization-wide'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {report.closeQueue.length > 0 && <Button variant="outline" onClick={() => setQueueIndex(0)}><LockKeyhole className="size-4" /> Close all my open OKRs ({report.closeQueue.length})</Button>}
          <Button asChild><a href={`/api/reports/period-close/${report.timeframe.id}/pdf`}><Download className="size-4" /> Export PDF</a></Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Objectives closed" value={`${report.closeProgress.closedObjectives}/${report.closeProgress.totalObjectives}`} />
        <Metric label="Key Results closed" value={`${report.closeProgress.closedKeyResults}/${report.closeProgress.totalKeyResults}`} />
        <Metric label="Average grade delta" value={report.averageGradeDelta == null ? '—' : `${report.averageGradeDelta >= 0 ? '+' : ''}${report.averageGradeDelta.toFixed(2)}`} />
        <Metric label="Rolled forward" value={report.rollForward.rolled} />
      </div>

      {report.stillToClose.length > 0 && <Card><CardHeader><CardTitle>Still to close</CardTitle></CardHeader><CardContent><div className="grid gap-2 sm:grid-cols-2">{report.stillToClose.map((item) => <Link key={`${item.kind}-${item.id}`} href={item.kind === 'OBJECTIVE' ? `/dashboard/objectives/${item.id}` : `/dashboard/key-results/${item.id}`} className="rounded-lg border border-border p-3 hover:bg-muted/50"><span className="text-sm font-medium">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{item.kind.replace('_', ' ')} · {item.owner.name}</span></Link>)}</div></CardContent></Card>}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Outcome mix"><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={report.outcomeMix} dataKey="count" nameKey="outcome" innerRadius={55} outerRadius={90}>{report.outcomeMix.map((entry, index) => <Cell key={entry.outcome} fill={CHART_COLORS[index]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></ChartCard>
        <ChartCard title="Grade distribution"><ResponsiveContainer width="100%" height={280}><BarChart data={report.gradeHistogram}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="label" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="var(--ap-blue)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer><p className="text-xs text-muted-foreground">A healthy stretch period often clusters around 0.6–0.7; this is guidance, not an individual judgment.</p></ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Primary blocker Pareto"><ResponsiveContainer width="100%" height={260}><BarChart data={report.blockers} layout="vertical"><CartesianGrid stroke="var(--border)" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="blocker" width={110} tickFormatter={(value) => String(value).replace(/_/g, ' ')} /><Tooltip /><Bar dataKey="count" fill="var(--ap-orange)" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></ChartCard>
        <Card><CardHeader><CardTitle>Roll-forward status</CardTitle></CardHeader><CardContent className="space-y-3"><StatusRow label="Rolled into next period" value={report.rollForward.rolled} /><StatusRow label="Completed here" value={report.rollForward.completed} /><StatusRow label="Abandoned" value={report.rollForward.abandoned} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Lessons digest</CardTitle></CardHeader><CardContent className="max-h-72 space-y-4 overflow-y-auto">{report.lessons.length === 0 ? <p className="text-sm text-muted-foreground">No closed-OKR lessons yet.</p> : report.lessons.map((lesson) => <div key={`${lesson.kind}-${lesson.id}`}><Link href={lesson.kind === 'OBJECTIVE' ? `/dashboard/objectives/${lesson.id}` : `/dashboard/key-results/${lesson.id}`} className="text-sm font-medium text-primary hover:underline">{lesson.title}</Link><p className="text-xs text-muted-foreground">{lesson.department}</p><div className="prose prose-sm mt-1 max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: lesson.lesson }} /></div>)}</CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle>Objective close ledger</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-muted-foreground"><tr><th className="py-3 pr-4">Objective</th><th className="py-3 pr-4">Owner</th><th className="py-3 pr-4">Outcome</th><th className="py-3 pr-4">Grade</th><th className="py-3 pr-4">Progress</th><th className="py-3 pr-4">Reopens</th><th className="py-3">Next period</th></tr></thead><tbody>{report.objectives.map((objective) => <tr key={objective.id} className="border-b border-border/60"><td className="py-3 pr-4"><Link className="font-medium text-primary hover:underline" href={`/dashboard/objectives/${objective.id}`}>{objective.title}</Link></td><td className="py-3 pr-4">{objective.owner.name}</td><td className="py-3 pr-4">{objective.outcome || objective.closureStatus}</td><td className="py-3 pr-4">{objective.finalGrade?.toFixed(2) ?? '—'}</td><td className="py-3 pr-4">{objective.finalProgress == null ? '—' : `${Math.round(objective.finalProgress)}%`}</td><td className="py-3 pr-4">{objective.reopenCount}</td><td className="py-3">{objective.rolledTo ? <Link className="text-primary hover:underline" href={`/dashboard/objectives/${objective.rolledTo.id}`}>{objective.rolledTo.timeframe.name}</Link> : '—'}</td></tr>)}</tbody></table></CardContent></Card>

      {queueEntity && <OkrCloseModal open entityType={queueEntity.kind === 'OBJECTIVE' ? 'objective' : 'keyResult'} entity={queueEntity} onClose={() => setQueueIndex(null)} onCommitted={advanceQueue} onInitiated={() => router.refresh()} />}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) { return <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold text-foreground">{value}</p></CardContent></Card> }
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) { return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{children}</CardContent></Card> }
function StatusRow({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"><span className="text-sm text-muted-foreground">{label}</span><span className="font-semibold">{value}</span></div> }
