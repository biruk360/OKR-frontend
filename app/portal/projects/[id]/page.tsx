import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Download, Eye, FileText } from 'lucide-react'
import { getServerSessionSafe } from '@/lib/auth'
import { canPortalUserAccessProject, getPortalSessionSafe } from '@/lib/portal-auth'
import { prisma } from '@/lib/prisma'
import {
  portalProjectWhere,
  portalRaidItemWhere,
  portalReportWhere,
  serializeDelayForClient,
  serializeProjectForClient,
  serializeRaidItemForClient,
  serializeReportForClient,
  type ClientActivity,
  type ClientProject,
} from '@/features/projects/services/portal-serializer'
import {
  awaitingClientActions,
  flattenClientActivities,
  portalDelayRows,
  type PortalAwaitingAction,
} from '@/features/projects/services/portal-dashboard'
import { projectPortalInclude } from '@/features/projects/services/portal-project-query'
import PortalCommentBox from './PortalCommentBox'

export default async function PortalProjectPage({ params }: { params: { id: string } }) {
  const [portalSession, internalSession] = await Promise.all([
    getPortalSessionSafe(),
    getServerSessionSafe(),
  ])
  if (!portalSession && !internalSession) redirect('/portal/signin')
  if (portalSession && !canPortalUserAccessProject(portalSession, params.id)) notFound()

  const projectWhere = portalSession
    ? { ...portalProjectWhere(portalSession.user.projectIds), id: params.id }
    : {
        id: params.id,
        portalEnabled: true,
        archivedAt: null,
        ...(internalSession && internalSession.user.role !== 'ADMIN' && internalSession.user.role !== 'EXECUTIVE'
          ? { projectManagerId: internalSession.user.id }
          : {}),
      }

  const [project, users, delays, reports, raidItems] = await Promise.all([
    prisma.project.findFirst({
      where: projectWhere,
      include: projectPortalInclude,
    }),
    prisma.user.findMany({ where: { isActive: true }, select: { name: true } }),
    prisma.delayEvent.findMany({
      where: { projectId: params.id },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.projectReport.findMany({
      where: portalReportWhere(params.id),
      orderBy: { periodEnd: 'desc' },
    }),
    prisma.raidItem.findMany({
      where: portalRaidItemWhere(params.id),
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
  ])
  if (!project) notFound()

  const forbiddenEmployeeNames = users.map((u) => u.name).filter(Boolean) as string[]
  const projectDto = serializeProjectForClient(project, { forbiddenEmployeeNames })
  const delayDtos = delays.map((delay) => serializeDelayForClient(delay, { forbiddenEmployeeNames }))
  const awaitingActions = awaitingClientActions(projectDto)
  const delayRows = portalDelayRows(projectDto, delayDtos)
  const reportDtos = reports.map((report) => serializeReportForClient(report, { forbiddenEmployeeNames }))
  const raidDtos = raidItems.map((item) => serializeRaidItemForClient(item, { forbiddenEmployeeNames }))
  const ganttRows = flattenClientActivities(projectDto)

  return (
    <main className="min-h-screen bg-surface-muted px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/portal" className="mb-4 inline-flex text-body-sm text-ink-secondary hover:text-ink-primary">Back to portal</Link>
        {internalSession && !portalSession && (
          <div className="mb-4 rounded-card border border-warning-500/30 bg-warning-50 px-4 py-3 text-body-sm font-medium text-warning-700">
            <Eye className="mr-2 inline size-4" /> Viewing as client - this is what they see.
          </div>
        )}

        <section className="rounded-card bg-surface-card p-6 shadow-card">
          <div className="text-body-sm text-ink-tertiary">{projectDto.code} · {projectDto.clientName}</div>
          <h1 className="mt-1 text-page-title text-ink-primary">{projectDto.name}</h1>
          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <Stat label="Complete" value={`${Math.round(projectDto.percentComplete)}%`} />
            <Stat label="Expected" value={`${Math.round(projectDto.percentPlanned)}%`} />
            <Stat label="RAG" value={projectDto.ragStatus} />
            <Stat label="Baseline" value={`v${projectDto.baselineVersion}`} />
          </div>
        </section>

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
              <div className="rounded-card border border-black/[0.08] p-4 text-body-sm text-ink-secondary">No client actions are currently waiting.</div>
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
                <tr className="border-b border-black/[0.08]">
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
                  <tr key={row.id} className="border-b border-black/[0.06] last:border-0">
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

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-card bg-surface-card p-6 shadow-card">
            <h2 className="text-section-title text-ink-primary">Published Reports</h2>
            <div className="mt-4 space-y-3">
              {reportDtos.length === 0 && <div className="text-body-sm text-ink-secondary">No published reports yet.</div>}
              {reportDtos.map((report) => (
                <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-black/[0.08] p-4">
                  <div>
                    <div className="flex items-center gap-2 text-body-sm font-semibold text-ink-primary">
                      <FileText className="size-4" /> {formatReason(report.type)}
                    </div>
                    <div className="mt-1 text-body-xs text-ink-tertiary">{formatShortDate(report.periodStart)} - {formatShortDate(report.periodEnd)}</div>
                    {report.aiSummary && <p className="mt-2 line-clamp-2 text-body-sm text-ink-secondary">{report.aiSummary}</p>}
                  </div>
                  {portalSession && (
                    <div className="flex gap-2">
                      <Link href={`/api/portal/projects/${projectDto.id}/reports/${report.id}`} className="rounded-md border border-black/[0.12] px-3 py-2 text-body-sm text-ink-primary hover:bg-surface-muted">View</Link>
                      <Link href={`/api/portal/projects/${projectDto.id}/reports/${report.id}?download=1`} className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-3 py-2 text-body-sm font-semibold text-white">
                        <Download className="size-4" /> Download
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-card bg-surface-card p-6 shadow-card">
            <h2 className="text-section-title text-ink-primary">Open RAID</h2>
            <div className="mt-4 space-y-3">
              {raidDtos.length === 0 && <div className="text-body-sm text-ink-secondary">No client-visible RAID items.</div>}
              {raidDtos.slice(0, 6).map((item) => (
                <div key={item.id} className="rounded-card border border-black/[0.08] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-body-sm font-semibold text-ink-primary">{item.refCode} · {item.title}</div>
                    <span className="rounded-pill bg-surface-muted px-2 py-1 text-body-xs text-ink-secondary">{item.type}</span>
                  </div>
                  {item.description && <p className="mt-2 text-body-sm text-ink-secondary">{item.description}</p>}
                  <div className="mt-2 text-body-xs text-ink-tertiary">{item.status}{item.dependsOnParty ? ` · ${formatOwner(item.dependsOnParty)}` : ''}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
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
    <div className="rounded-card border border-black/[0.08] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-body-sm text-ink-tertiary">{action.phaseName} · {action.milestoneName}</div>
          <h3 className="mt-1 text-card-title text-ink-primary">{action.title}</h3>
        </div>
        <span className={`rounded-pill px-3 py-1 text-body-xs font-semibold ${action.isOverSla ? 'bg-danger-50 text-danger-700' : 'bg-success-50 text-success-700'}`}>
          {action.daysWaiting} bd
        </span>
      </div>
      <div className="mt-3 text-body-sm text-ink-secondary">SLA {action.slaBusinessDays} business days · waiting since {formatShortDate(action.waitingSince)}</div>
      {commentsEnabled ? (
        <PortalCommentBox projectId={projectId} activityId={action.activityId} />
      ) : (
        <div className="mt-3 rounded-md bg-surface-muted px-3 py-2 text-body-xs text-ink-tertiary">Client comments are available in a portal session.</div>
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
    <div className="grid grid-cols-[260px_120px_1fr] items-center gap-3 rounded-md border border-black/[0.06] bg-white px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-body-sm font-semibold text-ink-primary">{activity.title}</div>
        <div className="truncate text-body-xs text-ink-tertiary">{phaseName} · {milestoneName}</div>
      </div>
      <div className="text-body-xs font-medium text-ink-secondary">{activity.owner}</div>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-black/[0.08] p-4">
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

function formatReason(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')
}
