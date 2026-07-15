'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, FileText, Save, Wand2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import {
  useGeneratePerformanceReports,
  usePerformanceReports,
  useUpdatePerformanceReport,
  type PerformanceCadence,
  type ProjectReportNode,
} from '../../hooks/useProject'

const CADENCES: PerformanceCadence[] = ['DAILY', 'WEEKLY', 'SPRINT', 'MONTHLY']

interface IndividualContent {
  rows: Array<{
    developerName: string
    userId: string | null
    email: string | null
    assignedTasks: number
    originalEstimateHours: number
    bufferHours: number
    completed: number
    blocked: number
    performancePct: number
    idleDays: number
    estimateAccuracy: number | null
    cycleTimeDays: number | null
    blockedDurationDays: number
    scrumAttendancePct: number | null
    aiInsight: string
  }>
}

interface TeamContent {
  assigned: number
  completed: number
  blocked: number
  teamPerformancePct: number
  velocity: number
  velocityTrend: number | null
  jiraAdoptionScore: number
  aiInsight: string
}

export function PerformanceReportsPanel({ projectId, canEdit, jiraLinked }: { projectId: string; canEdit: boolean; jiraLinked: boolean }) {
  const [cadence, setCadence] = useState<PerformanceCadence>('WEEKLY')
  const { data, isLoading } = usePerformanceReports(projectId, cadence, jiraLinked)
  const generate = useGeneratePerformanceReports(projectId, cadence)
  const update = useUpdatePerformanceReport(projectId)

  if (!jiraLinked) return null
  if (isLoading) return <Skeleton className="h-72 w-full rounded-card" />

  const individual = data?.individualReport ?? null
  const team = data?.teamReport ?? null

  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-body-sm font-medium text-ink-primary">Individual & Team Performance</div>
          <div className="text-body-sm text-ink-tertiary">R3/R4 · Jira evidence · PM-editable insights</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input h-9" value={cadence} onChange={(e) => setCadence(e.target.value as PerformanceCadence)}>
            {CADENCES.map((value) => <option key={value} value={value}>{labelize(value)}</option>)}
          </select>
          {canEdit && (
            <button className="btn btn-primary btn-sm" disabled={generate.isPending} onClick={() => generate.mutate()}>
              <Wand2 className="mr-1 size-3.5" /> Generate
            </button>
          )}
        </div>
      </div>

      {!individual || !team ? (
        <EmptyState icon={FileText} title="No performance reports for this cadence" description="Generate R3/R4 from Jira and scrum evidence." />
      ) : (
        <div className="space-y-5">
          <TeamReportCard projectId={projectId} report={team} canEdit={canEdit} saving={update.isPending} onSave={(teamInsight) => update.mutate({ reportId: team.id, teamInsight })} />
          <IndividualReportTable projectId={projectId} report={individual} canEdit={canEdit} saving={update.isPending} onSave={(individualInsights) => update.mutate({ reportId: individual.id, individualInsights })} />
        </div>
      )}
    </div>
  )
}

function TeamReportCard({ projectId, report, canEdit, saving, onSave }: {
  projectId: string
  report: ProjectReportNode
  canEdit: boolean
  saving: boolean
  onSave: (teamInsight: string) => void
}) {
  const content = report.contentJson as TeamContent
  const [insight, setInsight] = useState(content.aiInsight)
  useEffect(() => setInsight(content.aiInsight), [report.id, content.aiInsight])
  return (
    <div className="rounded-card border border-black/[0.08] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-body-sm font-medium text-ink-primary">R4 Team Report</div>
        <a className="btn btn-outline btn-sm" href={`/api/projects/${projectId}/performance-reports/${report.id}/pdf`}><Download className="mr-1 size-3.5" /> PDF</a>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Assigned" value={content.assigned} />
        <Kpi label="Completed" value={content.completed} />
        <Kpi label="Blocked" value={content.blocked} />
        <Kpi label="Team perf" value={`${content.teamPerformancePct}%`} />
        <Kpi label="Velocity" value={content.velocity} sub={content.velocityTrend == null ? 'No prior' : `${content.velocityTrend >= 0 ? '+' : ''}${content.velocityTrend}`} />
        <Kpi label="Jira adoption" value={content.jiraAdoptionScore} />
      </div>
      <InsightEditor value={insight} disabled={!canEdit} saving={saving} changed={insight.trim() !== content.aiInsight.trim()} onChange={setInsight} onSave={() => onSave(insight)} />
    </div>
  )
}

function IndividualReportTable({ projectId, report, canEdit, saving, onSave }: {
  projectId: string
  report: ProjectReportNode
  canEdit: boolean
  saving: boolean
  onSave: (insights: Record<string, string>) => void
}) {
  const content = report.contentJson as IndividualContent
  const initial = useMemo(() => Object.fromEntries(content.rows.map((row) => [row.userId ?? row.email ?? row.developerName, row.aiInsight])), [content.rows])
  const [insights, setInsights] = useState(initial)
  useEffect(() => setInsights(initial), [initial])
  const changed = JSON.stringify(insights) !== JSON.stringify(initial)
  return (
    <div className="rounded-card border border-black/[0.08] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-body-sm font-medium text-ink-primary">R3 Individual Report</div>
        <div className="flex gap-2">
          {canEdit && <button className="btn btn-outline btn-sm" disabled={!changed || saving} onClick={() => onSave(insights)}><Save className="mr-1 size-3.5" /> Save insights</button>}
          <a className="btn btn-outline btn-sm" href={`/api/projects/${projectId}/performance-reports/${report.id}/pdf`}><Download className="mr-1 size-3.5" /> PDF</a>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-body-sm">
          <thead>
            <tr className="border-b border-black/[0.08] text-left text-ink-tertiary">
              {['Developer', 'Assigned', 'Estimate', 'Buffer', 'Done', 'Blocked', 'Perf', 'Idle', 'Accuracy', 'Cycle', 'Blocked days', 'Scrum', 'AI insight'].map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04]">
            {content.rows.map((row) => {
              const key = row.userId ?? row.email ?? row.developerName
              return (
                <tr key={key}>
                  <td className="px-2 py-2 font-medium text-ink-primary">{row.developerName}</td>
                  <td className="px-2 py-2">{row.assignedTasks}</td>
                  <td className="px-2 py-2">{row.originalEstimateHours}</td>
                  <td className="px-2 py-2">{row.bufferHours}</td>
                  <td className="px-2 py-2">{row.completed}</td>
                  <td className="px-2 py-2">{row.blocked}</td>
                  <td className={cn('px-2 py-2 font-medium', row.performancePct >= 80 ? 'text-success-700' : row.performancePct >= 60 ? 'text-warning-700' : 'text-danger-700')}>{row.performancePct}%</td>
                  <td className="px-2 py-2">{row.idleDays}</td>
                  <td className="px-2 py-2">{row.estimateAccuracy ?? '-'}</td>
                  <td className="px-2 py-2">{row.cycleTimeDays ?? '-'}</td>
                  <td className="px-2 py-2">{row.blockedDurationDays}</td>
                  <td className="px-2 py-2">{row.scrumAttendancePct ?? '-'}</td>
                  <td className="min-w-72 px-2 py-2">
                    <textarea
                      className="input min-h-16 w-full text-body-sm"
                      disabled={!canEdit}
                      value={insights[key] ?? row.aiInsight}
                      onChange={(e) => setInsights((current) => ({ ...current, [key]: e.target.value }))}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function InsightEditor({ value, disabled, saving, changed, onChange, onSave }: {
  value: string
  disabled: boolean
  saving: boolean
  changed: boolean
  onChange: (value: string) => void
  onSave: () => void
}) {
  return (
    <div className="mt-3">
      <textarea className="input min-h-20 w-full" disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} />
      {!disabled && <div className="mt-2 flex justify-end"><button className="btn btn-outline btn-sm" disabled={!changed || saving} onClick={onSave}><Save className="mr-1 size-3.5" /> Save insight</button></div>}
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return <div className="rounded-md border border-black/[0.08] p-2"><div className="text-[11px] uppercase text-ink-tertiary">{label}</div><div className="text-section-title text-ink-primary">{value}</div>{sub && <div className="text-[12px] text-ink-tertiary">{sub}</div>}</div>
}

function labelize(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}
