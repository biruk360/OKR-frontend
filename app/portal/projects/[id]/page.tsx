import Link from 'next/link'
import type { ReactNode } from 'react'
import { Download, Eye, FileText, Flag, Paperclip } from 'lucide-react'
import type {
  ClientActivity,
  ClientMilestone,
  ClientProject,
  ClientProjectAttachment,
} from '@/features/projects/services/portal-serializer'
import type { PortalAwaitingAction } from '@/features/projects/services/portal-dashboard'
import { loadPortalProjectPage } from '@/features/projects/services/portal-pages.server'
import PortalCommentBox from './PortalCommentBox'
import PlannedVsActualTab from './PlannedVsActualTab'
import ChangeRequestsTab from './ChangeRequestsTab'
import PortalSignOutButton from '../../PortalSignOutButton'
import PortalProjectSwitcher from '../../PortalProjectSwitcher'
import { ProjectProgress } from '@/features/projects/components/ProjectProgress'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'milestones', label: 'Milestones' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'planned-vs-actual', label: 'Planned vs Actual' },
  { id: 'change-requests', label: 'Change Requests' },
  { id: 'documents', label: 'Documents' },
  { id: 'reports', label: 'Reports' },
] as const
type PortalTab = (typeof TABS)[number]['id']

export default async function PortalProjectPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { tab?: string | string[] }
}) {
  const requestedTab = typeof searchParams?.tab === 'string' ? searchParams.tab : 'overview'
  const tab: PortalTab = TABS.some((t) => t.id === requestedTab) ? (requestedTab as PortalTab) : 'overview'
  const {
    portalSession,
    internalSession,
    projectDto,
    awaitingActions,
    delayRows,
    reportDtos,
    raidDtos,
    ganttRows,
    switcherProjects,
    documents,
    plannedVsActual,
    changeRequests,
    milestoneRows,
  } = await loadPortalProjectPage(params, tab)

  return (
    <main className="min-h-screen bg-surface-muted px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link href="/portal" className="inline-flex text-body-sm text-ink-secondary hover:text-ink-primary">Back to portal</Link>
          {portalSession && (
            <div className="flex flex-wrap items-center gap-3">
              <PortalProjectSwitcher currentId={projectDto.id} projects={switcherProjects} />
              <PortalSignOutButton />
            </div>
          )}
        </div>
        {internalSession && !portalSession && (
          <div className="mb-4 rounded-card border border-warning-500/30 bg-warning-50 px-4 py-3 text-body-sm font-medium text-warning-700">
            <Eye className="mr-2 inline size-4" /> Viewing as client - this is what they see.
          </div>
        )}

        <section className="rounded-card bg-surface-card p-6 shadow-card">
          <div className="text-body-sm text-ink-tertiary">{projectDto.code} · {projectDto.clientName}</div>
          <h1 className="mt-1 text-page-title text-ink-primary">{projectDto.name}</h1>
          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <Stat label="Complete" value={<ProjectProgress actual={projectDto.percentComplete} planned={projectDto.percentPlanned} variant="value" />} />
            <Stat label="Expected" value={`${Math.round(projectDto.percentPlanned)}%`} />
            <Stat label="RAG" value={projectDto.ragStatus} />
            <Stat label="Baseline" value={`v${projectDto.baselineVersion}`} />
          </div>
        </section>
        <nav className="mt-6 flex flex-wrap gap-1 rounded-card bg-surface-card p-1 shadow-card" aria-label="Project sections">
          {TABS.map((item) => (
            <Link
              key={item.id}
              href={item.id === 'overview' ? `/portal/projects/${projectDto.id}` : `/portal/projects/${projectDto.id}?tab=${item.id}`}
              aria-current={tab === item.id ? 'page' : undefined}
              className={`rounded-md px-3 py-2 text-body-sm font-medium ${tab === item.id ? 'bg-primary-50 text-primary-700' : 'text-ink-secondary hover:bg-surface-muted hover:text-ink-primary'}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {tab === 'overview' && (
          <>
            <section className="mt-6 rounded-card bg-surface-card p-6 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-section-title text-ink-primary">Awaiting Your Action</h2>
                  <p className="mt-1 text-body-sm text-ink-secondary">Client-owned approvals sorted by business days waiting.</p>
                </div>
                <span className="rounded-pill bg-primary-50 px-3 py-1 text-body-sm font-semibold text-primary-700">{awaitingActions.length} open</span>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {awaitingActions.length === 0 && (
                  <div className="rounded-card border border-ink-primary/[0.08] p-4 text-body-sm text-ink-secondary">No client actions are currently waiting.</div>
                )}
                {awaitingActions.map((action) => (
                  <AwaitingActionCard
                    key={action.activityId}
                    action={action}
                    projectId={projectDto.id}
                    commentsEnabled={Boolean(portalSession)}
                  />
                ))}
              </div>
            </section>

            <section className="mt-6">
              <div className="rounded-card bg-surface-card p-6 shadow-card">
                <h2 className="text-section-title text-ink-primary">Open RAID</h2>
                <div className="mt-4 space-y-3">
                  {raidDtos.length === 0 && <div className="text-body-sm text-ink-secondary">No client-visible RAID items.</div>}
                  {raidDtos.slice(0, 6).map((item) => (
                    <div key={item.id} className="rounded-card border border-ink-primary/[0.08] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-body-sm font-semibold text-ink-primary">{item.refCode} · {item.title}</div>
                        <span className="rounded-pill bg-surface-muted px-2 py-1 text-xs text-ink-secondary">{item.type}</span>
                      </div>
                      {item.description && <p className="mt-2 text-body-sm text-ink-secondary">{item.description}</p>}
                      <div className="mt-2 text-xs text-ink-tertiary">{item.status}{item.dependsOnParty ? ` · ${formatOwner(item.dependsOnParty)}` : ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
        {tab === 'milestones' && (
          <section className="mt-6 rounded-card bg-surface-card p-6 shadow-card">
            <h2 className="text-section-title text-ink-primary">Milestones</h2>
            <p className="mt-1 text-body-sm text-ink-secondary">Agreed (baseline) dates against the current forecast.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-body-sm">
                <thead className="text-ink-tertiary">
                  <tr className="border-b border-ink-primary/[0.08]">
                    <th className="py-2 pr-4 font-semibold">Milestone</th>
                    <th className="py-2 pr-4 font-semibold">Phase</th>
                    <th className="py-2 pr-4 font-semibold">Baseline</th>
                    <th className="py-2 pr-4 font-semibold">Forecast</th>
                    <th className="py-2 pr-4 font-semibold">Variance</th>
                    <th className="py-2 pr-4 font-semibold">Complete</th>
                    <th className="py-2 pr-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {milestoneRows.length === 0 && (
                    <tr><td colSpan={7} className="py-4 text-ink-secondary">No milestones yet.</td></tr>
                  )}
                  {milestoneRows.map(({ phaseName, milestone }) => (
                    <tr key={milestone.id} className="border-b border-ink-primary/[0.06] last:border-0">
                      <td className="py-3 pr-4 text-ink-primary">
                        <span className="inline-flex items-center gap-1.5">{milestone.isKeyMilestone && <Flag className="size-3.5 text-primary-600" aria-label="Key milestone" />}{milestone.name}</span>
                      </td>
                      <td className="py-3 pr-4 text-ink-secondary">{phaseName}</td>
                      <td className="py-3 pr-4 text-ink-secondary">{formatShortDate(milestone.baselineDate)}</td>
                      <td className="py-3 pr-4 text-ink-secondary">{formatShortDate(milestone.currentDate)}</td>
                      <td className="py-3 pr-4 font-semibold text-ink-primary">{formatVariance(milestone)}</td>
                      <td className="py-3 pr-4 text-ink-secondary">{Math.round(milestone.percentComplete)}%</td>
                      <td className="py-3 pr-4 text-ink-secondary">{formatReason(milestone.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {tab === 'schedule' && (
          <>
            <section className="mt-6 rounded-card bg-surface-card p-6 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-section-title text-ink-primary">Schedule</h2>
                  <p className="mt-1 text-body-sm text-ink-secondary">Anonymized Gantt view with owner labels limited to client and 360Ground teams.</p>
                </div>
                <span className="text-body-sm text-ink-tertiary">{formatShortDate(projectDto.plannedStart)} - {formatShortDate(projectDto.plannedEnd)}</span>
              </div>
              <div className="mt-4 overflow-x-auto">
                <div className="min-w-[760px] space-y-2">
                  {ganttRows.map(({ phaseName, milestoneName, activity }) => (
                    <GanttRow key={activity.id} project={projectDto} activity={activity} phaseName={phaseName} milestoneName={milestoneName} />
                  ))}
                </div>
              </div>
            </section>
            <section className="mt-6 rounded-card bg-surface-card p-6 shadow-card">
              <h2 className="text-section-title text-ink-primary">Schedule Changes</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-body-sm">
                  <thead className="text-ink-tertiary">
                    <tr className="border-b border-ink-primary/[0.08]">
                      <th className="py-2 pr-4 font-semibold">Activity</th>
                      <th className="py-2 pr-4 font-semibold">Original</th>
                      <th className="py-2 pr-4 font-semibold">Current</th>
                      <th className="py-2 pr-4 font-semibold">Days</th>
                      <th className="py-2 pr-4 font-semibold">Owner</th>
                      <th className="py-2 pr-4 font-semibold">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delayRows.length === 0 && (
                      <tr><td colSpan={6} className="py-4 text-ink-secondary">No delay events recorded.</td></tr>
                    )}
                    {delayRows.map((row) => (
                      <tr key={row.id} className="border-b border-ink-primary/[0.06] last:border-0">
                        <td className="py-3 pr-4 text-ink-primary">{row.activityTitle}</td>
                        <td className="py-3 pr-4 text-ink-secondary">{formatShortDate(row.originalDate)}</td>
                        <td className="py-3 pr-4 text-ink-secondary">{formatShortDate(row.currentDate)}</td>
                        <td className="py-3 pr-4 font-semibold text-ink-primary">{row.daysLost}</td>
                        <td className="py-3 pr-4 text-ink-secondary">{formatOwner(row.owner)}</td>
                        <td className="py-3 pr-4 text-ink-secondary">{formatReason(row.reason)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
        {tab === 'documents' && (
          <section className="mt-6 rounded-card bg-surface-card p-6 shadow-card">
            <h2 className="text-section-title text-ink-primary">Documents</h2>
            <p className="mt-1 text-body-sm text-ink-secondary">Files the project team has shared with you.</p>
            <div className="mt-4 space-y-2">
              {documents.length === 0 && <div className="text-body-sm text-ink-secondary">No documents have been shared yet.</div>}
              {documents.map((doc: ClientProjectAttachment) => (
                <div key={doc.id} className="flex flex-wrap items-center gap-3 rounded-card border border-ink-primary/[0.08] px-4 py-3">
                  <Paperclip className="size-4 text-ink-tertiary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body-sm font-semibold text-ink-primary">{doc.fileName}</div>
                    <div className="truncate text-xs text-ink-tertiary">{doc.activityTitle} · {formatBytes(doc.fileSize)} · {formatShortDate(doc.createdAt)}</div>
                  </div>
                  {portalSession && (
                    <a href={`/api/portal/projects/${projectDto.id}/activities/${doc.activityId}/attachments/${doc.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-ink-primary/[0.12] px-3 py-2 text-body-sm text-ink-primary hover:bg-surface-muted">
                      <Download className="size-4" /> Open
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
        {tab === 'planned-vs-actual' && plannedVsActual && <PlannedVsActualTab data={plannedVsActual} />}
        {tab === 'change-requests' && <ChangeRequestsTab rows={changeRequests} />}
        {tab === 'reports' && (
          <section className="mt-6">
          <div className="rounded-card bg-surface-card p-6 shadow-card">
            <h2 className="text-section-title text-ink-primary">Published Reports</h2>
            <div className="mt-4 space-y-3">
              {reportDtos.length === 0 && <div className="text-body-sm text-ink-secondary">No published reports yet.</div>}
              {reportDtos.map((report) => (
                <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-ink-primary/[0.08] p-4">
                  <div>
                    <div className="flex items-center gap-2 text-body-sm font-semibold text-ink-primary">
                      <FileText className="size-4" /> {formatReason(report.type)}
                    </div>
                    <div className="mt-1 text-xs text-ink-tertiary">{formatShortDate(report.periodStart)} - {formatShortDate(report.periodEnd)}</div>
                    {report.aiSummary && <p className="mt-2 line-clamp-2 text-body-sm text-ink-secondary">{report.aiSummary}</p>}
                  </div>
                  {portalSession && (
                    <div className="flex gap-2">
                      <Link href={`/api/portal/projects/${projectDto.id}/reports/${report.id}`} className="rounded-md border border-ink-primary/[0.12] px-3 py-2 text-body-sm text-ink-primary hover:bg-surface-muted">View</Link>
                      <Link href={`/api/portal/projects/${projectDto.id}/reports/${report.id}?download=1`} className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-3 py-2 text-body-sm font-semibold text-primary-foreground">
                        <Download className="size-4" /> {report.type === 'CLIENT_BIMONTHLY' ? 'Download PDF' : 'Download'}
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          </section>
        )}
      </div>
    </main>
  )
}

function AwaitingActionCard({
  action,
  projectId,
  commentsEnabled,
}: {
  action: PortalAwaitingAction
  projectId: string
  commentsEnabled: boolean
}) {
  return (
    <div className="rounded-card border border-ink-primary/[0.08] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-body-sm text-ink-tertiary">{action.phaseName} · {action.milestoneName}</div>
          <h3 className="mt-1 text-body font-semibold text-ink-primary">{action.title}</h3>
        </div>
        <span className={`rounded-pill px-3 py-1 text-xs font-semibold ${action.isOverSla ? 'bg-danger-50 text-danger-700' : 'bg-success-50 text-success-700'}`}>
          {action.daysWaiting} bd
        </span>
      </div>
      <div className="mt-3 text-body-sm text-ink-secondary">SLA {action.slaBusinessDays} business days · waiting since {formatShortDate(action.waitingSince)}</div>
      {commentsEnabled ? (
        <PortalCommentBox projectId={projectId} activityId={action.activityId} />
      ) : (
        <div className="mt-3 rounded-md bg-surface-muted px-3 py-2 text-xs text-ink-tertiary">Client comments are available in a portal session.</div>
      )}
    </div>
  )
}

function GanttRow({
  project,
  activity,
  phaseName,
  milestoneName,
}: {
  project: ClientProject
  activity: ClientActivity
  phaseName: string
  milestoneName: string
}) {
  const baseline = barPosition(project, activity.baselineStart, activity.baselineEnd)
  const current = barPosition(project, activity.currentStart, activity.currentEnd)
  return (
    <div className="grid grid-cols-[260px_120px_1fr] items-center gap-3 rounded-md border border-ink-primary/[0.06] bg-surface-card px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-body-sm font-semibold text-ink-primary">{activity.title}</div>
        <div className="truncate text-xs text-ink-tertiary">{phaseName} · {milestoneName}</div>
      </div>
      <div className="text-xs font-medium text-ink-secondary">{activity.owner}</div>
      <div className="relative h-10 rounded-md bg-surface-muted">
        {baseline && (
          <div
            className="absolute top-2 h-1.5 rounded bg-ink-tertiary/40"
            style={{ left: `${baseline.left}%`, width: `${baseline.width}%` }}
            title="Baseline"
          />
        )}
        {current && (
          <div
            className="absolute top-5 h-3 rounded bg-primary-500"
            style={{ left: `${current.left}%`, width: `${current.width}%` }}
            title={`${formatShortDate(activity.currentStart)} - ${formatShortDate(activity.currentEnd)}`}
          />
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-card border border-ink-primary/[0.08] p-4">
      <div className="text-body-sm text-ink-tertiary">{label}</div>
      <div className="mt-1 text-section-title text-ink-primary">{value}</div>
    </div>
  )
}

function barPosition(project: ClientProject, startValue: string | null, endValue: string | null) {
  if (!startValue || !endValue) return null
  const start = Date.parse(startValue)
  const end = Date.parse(endValue)
  const projectStart = Date.parse(project.plannedStart)
  const projectEnd = Date.parse(project.plannedEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(projectStart) || !Number.isFinite(projectEnd)) return null
  const total = Math.max(projectEnd - projectStart, 24 * 60 * 60 * 1000)
  const left = clamp(((start - projectStart) / total) * 100)
  const width = Math.max(1.5, clamp(((end - start) / total) * 100, 0, 100 - left))
  return { left, width }
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function formatShortDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function formatOwner(value: string) {
  if (value === 'CLIENT') return 'Client'
  if (value === '360GROUND') return '360Ground'
  if (value === 'THIRD_PARTY') return 'Third party'
  return value.charAt(0) + value.slice(1).toLowerCase()
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatVariance(milestone: ClientMilestone) {
  if (!milestone.baselineDate || !milestone.currentDate) return '-'
  const days = Math.round((Date.parse(milestone.currentDate) - Date.parse(milestone.baselineDate)) / 86_400_000)
  if (!Number.isFinite(days) || days === 0) return 'On plan'
  return days > 0 ? `+${days}d` : `${days}d`
}

function formatReason(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')
}
