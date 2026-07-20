'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, Gauge, TrendingUp, CalendarClock, Upload } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useProject, useCommitBaseline, useRebaseline, useRebaselineDiff } from '../hooks/useProject'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { RagBadge, ProjectStatusBadge } from './ProjectBadges'
import { DelayLedgerTable } from './DelayLedgerTable'
import { ProjectViewSwitcher } from './views/ProjectViewSwitcher'
import { RaidRegister } from './registers/RaidRegister'
import { ChangeControlBoard } from './registers/ChangeControlBoard'
import { StageGateRegister } from './registers/StageGateRegister'
import { ClientObligationsRegister } from './registers/ClientObligationsRegister'
import { CorrectionOfErrorsRegister } from './registers/CorrectionOfErrorsRegister'
import { PaymentMilestonesRegister } from './registers/PaymentMilestonesRegister'
import { JiraIntegrationPanel } from './integrations/JiraIntegrationPanel'
import { ScrumLogWidget } from './ScrumLogWidget'
import { ClientReportsPanel } from './reports/ClientReportsPanel'
import { PerformanceReportsPanel } from './reports/PerformanceReportsPanel'
import { ManagementReportsPanel } from './reports/ManagementReportsPanel'
import { ProjectObjectiveLinker } from './okr/ProjectObjectiveLinker'
import { ScheduleImportModal } from './ScheduleImportModal'

interface Props {
  projectId: string
  user: { id: string; role: string }
}

const CAN_EDIT_ROLES = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD']

export function ProjectDetailClient({ projectId, user }: Props) {
  const { data: project, isLoading, isError } = useProject(projectId)
  const commitBaseline = useCommitBaseline(projectId)
  const [commitOpen, setCommitOpen] = useState(false)
  const [baselineNotes, setBaselineNotes] = useState('')
  const [importOpen, setImportOpen] = useState(false)

  // Re-baseline (C2) state.
  const rebaseline = useRebaseline(projectId)
  const [rebaseOpen, setRebaseOpen] = useState(false)
  const [rebaseReason, setRebaseReason] = useState('')
  const [approverId, setApproverId] = useState('')
  const { data: diff, isLoading: diffLoading } = useRebaselineDiff(projectId, rebaseOpen)
  const { users } = useUsersForSelection({ enabled: rebaseOpen })
  const approvers = users.filter((u) => u.role === 'EXECUTIVE' || u.role === 'ADMIN')
  const reasonValid = rebaseReason.trim().length >= 20

  if (isLoading) {
    return (
      <div className="mx-auto max-w-content px-6 py-6">
        <Skeleton className="mb-4 h-8 w-64" />
        <div className="mb-6 grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-card" />)}</div>
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    )
  }

  if (isError || !project) {
    return (
      <div className="mx-auto max-w-content px-6 py-6">
        <EmptyState icon={AlertTriangle} title="Project unavailable" description="It may have been archived or you don't have access." />
      </div>
    )
  }

  // Manager or privileged roles may edit the schedule.
  const canEdit = CAN_EDIT_ROLES.includes(user.role) || project.projectManagerId === user.id
  const behind = project.percentPlanned - project.percentComplete
  const notBaselined = !project.baselineCommittedAt
  const activityCount = project.phases.reduce(
    (n, p) => n + p.milestones.reduce((m, ms) => m + ms.activities.length, 0), 0
  )

  return (
    <div className="mx-auto max-w-content px-6 py-6">
      <Link href="/dashboard/projects" className="mb-2 inline-flex items-center gap-1 text-body-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="size-4" /> Projects
      </Link>

      <PageHeader
        title={project.name}
        description={`${project.code} · ${project.clientName}`}
        actions={
          <div className="flex items-center gap-2">
            <ProjectStatusBadge status={project.status} />
            <RagBadge rag={project.ragStatus} />
          </div>
        }
      />

      <div className="mb-4">
        <ProjectObjectiveLinker projectId={project.id} objectiveId={project.objectiveId} canEdit={canEdit} />
      </div>

      {/* Baseline-not-committed banner (C1). */}
      {notBaselined && (
        <div className="mb-6 flex items-center gap-3 rounded-card border border-warning-500/30 bg-warning-50 px-4 py-3">
          <AlertTriangle className="size-5 shrink-0 text-warning-600" />
          <div className="flex-1">
            <div className="text-body font-medium text-ink-primary">Baseline not committed</div>
            <div className="text-body-sm text-ink-secondary">Delay tracking is inactive. Commit the baseline once the client has agreed the schedule.</div>
          </div>
          {canEdit && (
            <button onClick={() => setCommitOpen(true)} className="btn btn-primary shrink-0">
              Commit Baseline →
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={commitOpen}
        onClose={() => { setCommitOpen(false); setBaselineNotes('') }}
        onConfirm={async () => {
          try {
            await commitBaseline.mutateAsync({ notes: baselineNotes.trim() || undefined })
            setCommitOpen(false)
            setBaselineNotes('')
          } catch {
            // Error toast already shown by the mutation's onError; keep the dialog open.
          }
        }}
        title="Commit Baseline — Version 1"
        message="This freezes the current schedule as the agreed plan."
        variant="warning"
        confirmLabel="Commit Baseline"
        isLoading={commitBaseline.isPending}
        bullets={[
          `${activityCount} ${activityCount === 1 ? 'activity' : 'activities'} will be baselined`,
          'All future date changes will require a slip reason and owner',
          'This action is logged and cannot be silently undone',
        ]}
        extraContent={
          <label className="block">
            <span className="text-body-sm text-ink-secondary">Baseline notes (optional)</span>
            <textarea
              value={baselineNotes}
              onChange={(e) => setBaselineNotes(e.target.value)}
              maxLength={1000}
              rows={2}
              className="input mt-1 w-full"
              placeholder="e.g. Agreed with client at kickoff on …"
            />
          </label>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Complete" value={`${project.percentComplete.toFixed(0)}%`} iconText={`Planned ${project.percentPlanned.toFixed(0)}%`}
          tone={behind > 5 ? 'yellow' : 'blue'} />
        <StatCard label="Confidence" value={project.confidence} icon={Gauge}
          tone={project.confidence >= 75 ? 'green' : project.confidence >= 50 ? 'yellow' : 'red'} />
        <StatCard label="SPI" value={project.spi != null ? project.spi.toFixed(2) : '—'} icon={TrendingUp}
          tone={project.spi == null ? 'gray' : project.spi >= 0.95 ? 'green' : project.spi >= 0.85 ? 'yellow' : 'red'} />
        <StatCard label="Timeline" value={fmtRange(project.plannedStart, project.plannedEnd)} icon={CalendarClock} tone="gray" />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-section-title text-ink-primary">Schedule of Record</h2>
          {!notBaselined && (
            <span className="rounded-pill bg-surface-muted px-2.5 py-1 text-body-sm text-ink-secondary">
              Baseline v{project.baselineVersion}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-body-sm text-ink-tertiary">Phase → Milestone → Activity</span>
          {notBaselined && canEdit && (
            <button onClick={() => setImportOpen(true)} className="btn btn-outline">
              <Upload className="size-4" /> Import Schedule
            </button>
          )}
          {!notBaselined && canEdit && (
            <button onClick={() => setRebaseOpen(true)} className="btn btn-outline">
              Re-Baseline
            </button>
          )}
        </div>
      </div>

      <ScheduleImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        projectId={project.id}
        hasSchedule={activityCount > 0}
      />

      {/* Re-baseline modal (C2): diff preview + reason (≥20) + approver. */}
      <ConfirmDialog
        open={rebaseOpen}
        onClose={() => { setRebaseOpen(false); setRebaseReason(''); setApproverId('') }}
        onConfirm={async () => {
          try {
            await rebaseline.mutateAsync({ reason: rebaseReason.trim(), approverId: approverId || undefined })
            setRebaseOpen(false)
            setRebaseReason('')
            setApproverId('')
          } catch {
            // Error toast already shown by the mutation's onError; keep the dialog open.
          }
        }}
        title={`Re-Baseline — Version ${project.baselineVersion + 1}`}
        message="This freezes the current schedule as a new baseline. The previous baseline is preserved."
        variant="warning"
        confirmLabel="Re-Baseline"
        isLoading={rebaseline.isPending}
        disabled={!reasonValid}
        extraContent={
          <div className="space-y-3">
            <div>
              <div className="text-body-sm font-medium text-ink-primary">Diff preview</div>
              {diffLoading ? (
                <Skeleton className="mt-1 h-16 w-full rounded-card" />
              ) : diff && diff.changes.length > 0 ? (
                <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-card border border-black/[0.08] p-2">
                  {diff.changes.map((c) => (
                    <li key={c.activityId} className="text-body-sm text-ink-secondary">
                      <span className="font-medium text-ink-primary">{c.title}</span>
                      <span className="text-ink-tertiary"> ({c.phaseName})</span>{': '}
                      {fmtDate(c.oldEnd)} → {fmtDate(c.newEnd)}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-1 text-body-sm text-ink-tertiary">No schedule changes since the current baseline.</div>
              )}
            </div>
            <label className="block">
              <span className="text-body-sm text-ink-secondary">Reason * (min 20 characters)</span>
              <textarea
                value={rebaseReason}
                onChange={(e) => setRebaseReason(e.target.value)}
                maxLength={2000}
                rows={2}
                className="input mt-1 w-full"
                placeholder="Why is the baseline being revised?"
              />
              <span className={`text-body-sm ${reasonValid ? 'text-ink-tertiary' : 'text-warning-600'}`}>
                {rebaseReason.trim().length}/20 minimum
              </span>
            </label>
            <label className="block">
              <span className="text-body-sm text-ink-secondary">Approver (defaults to CEO/Executive)</span>
              <select value={approverId} onChange={(e) => setApproverId(e.target.value)} className="input mt-1 w-full">
                <option value="">Default (CEO/Executive)</option>
                {approvers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name ?? u.email} · {u.role}</option>
                ))}
              </select>
            </label>
          </div>
        }
      />

      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-section-title text-ink-primary">Project Views</h2>
          <span className="rounded-pill bg-primary-50 px-2.5 py-1 text-body-sm text-primary-700">E1</span>
        </div>
        <span className="text-body-sm text-ink-tertiary">Gantt · Table · Board · Workload · Mindmap · Overview</span>
      </div>
      <div className="mb-8">
        <ProjectViewSwitcher project={project} canEdit={canEdit} />
      </div>

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-section-title text-ink-primary">Delay Ledger</h2>
        <span className="text-body-sm text-ink-tertiary">Every delay, its owner, and why</span>
      </div>
      <DelayLedgerTable projectId={projectId} canEdit={canEdit} />

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-section-title text-ink-primary">RAID Register</h2>
        <span className="text-body-sm text-ink-tertiary">Risks, assumptions, issues, and dependencies</span>
      </div>
      <RaidRegister projectId={projectId} canEdit={canEdit} />

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-section-title text-ink-primary">Change Control Board</h2>
        <span className="text-body-sm text-ink-tertiary">Scope, requirement, and descope decisions</span>
      </div>
      <ChangeControlBoard project={project} canEdit={canEdit} />

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-section-title text-ink-primary">Stage Gates</h2>
        <span className="text-body-sm text-ink-tertiary">Phase entry, exit, deliverable, and approval gates</span>
      </div>
      <StageGateRegister project={project} canEdit={canEdit} />

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-section-title text-ink-primary">Client Obligations</h2>
        <span className="text-body-sm text-ink-tertiary">Named responsibilities, SLAs, and compliance</span>
      </div>
      <ClientObligationsRegister projectId={projectId} canEdit={canEdit} />

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-section-title text-ink-primary">Correction of Errors</h2>
        <span className="text-body-sm text-ink-tertiary">5-Whys, systemic fixes, and lessons learned</span>
      </div>
      <CorrectionOfErrorsRegister projectId={projectId} canEdit={canEdit} />

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-section-title text-ink-primary">Payment Milestones</h2>
        <span className="text-body-sm text-ink-tertiary">Deliverable approvals, invoicing, and overdue cash</span>
      </div>
      <PaymentMilestonesRegister project={project} canEdit={canEdit} />

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-section-title text-ink-primary">Client Reports</h2>
        <span className="text-body-sm text-ink-tertiary">R2 draft, approve, send, and portal visibility</span>
      </div>
      <ClientReportsPanel projectId={projectId} canEdit={canEdit} />

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-section-title text-ink-primary">Management Reports</h2>
        <span className="text-body-sm text-ink-tertiary">R6/R7/R9/R10 steering, COE, estimation, and capacity</span>
      </div>
      <ManagementReportsPanel projectId={projectId} canEdit={canEdit} />

      {project.jiraLinked && (
        <>
          <div className="mb-3 mt-8 flex items-center justify-between">
            <h2 className="text-section-title text-ink-primary">Performance Reports</h2>
            <span className="text-body-sm text-ink-tertiary">R3/R4 Jira evidence, attendance, and PM-editable insights</span>
          </div>
          <PerformanceReportsPanel projectId={projectId} canEdit={canEdit} jiraLinked={project.jiraLinked} />
        </>
      )}

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-section-title text-ink-primary">Daily Scrum</h2>
        <span className="text-body-sm text-ink-tertiary">Attendance, blockers, and accountability</span>
      </div>
      <ScrumLogWidget projectId={projectId} canEdit={canEdit} />

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-section-title text-ink-primary">Project Settings</h2>
        <span className="text-body-sm text-ink-tertiary">Integrations</span>
      </div>
      <JiraIntegrationPanel projectId={projectId} canEdit={canEdit} />
    </div>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const opt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  try {
    return new Date(iso).toLocaleDateString(undefined, opt)
  } catch {
    return '—'
  }
}

function fmtRange(start: string, end: string): string {
  const opt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  try {
    return `${new Date(start).toLocaleDateString(undefined, opt)} – ${new Date(end).toLocaleDateString(undefined, opt)}`
  } catch {
    return '—'
  }
}
